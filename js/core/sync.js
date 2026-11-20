// Sincronización de la app con el backend (BFF).
// · Descarga solo los cambios desde el último cursor (GET /api/data?since=…), por la pareja (sistema, ref): sin duplicados.
// · «Actualizar ahora» pide al backend leer Notion y Microsoft 365 (POST /api/sync/run) y después descarga.
// · Automática: al abrir la app y cada 5 minutos con la app visible. El backend además sincroniza cada 15 min con Cron.
// · Los datos DEMO no se borran: al llegar los primeros datos reales se ocultan (se pueden volver a mostrar).
import * as store from './store.js';
import { request, backendConfigured, backendUrl, NotConnectedError } from '../adapters/backend.js';

const listeners = new Set();
export const state = { busy: false, error: null, auth: null, lastSync: null };
export const onSync = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => { try { fn(state); } catch {} });

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const MAX_DOCS = 1500;

/** Enlaza registros con su local por nombre (Notion guarda «Local» como texto) y marca duplicados/conflictos de agenda. */
function derive() {
  const locales = store._raw('locales').filter((l) => l.source?.system === 'notion');
  const byName = new Map(locales.map((l) => [norm(l.nombre), l.id]));
  const findLocal = (txt) => {
    const n = norm(txt);
    if (!n) return null;
    if (byName.has(n)) return byName.get(n);
    const hit = locales.find((l) => n.includes(norm(l.nombre)) || norm(l.nombre).includes(n));
    return hit ? hit.id : null;
  };
  for (const col of ['visitas', 'incidencias', 'tareas', 'eventos', 'contactos']) {
    store._mutate(col, (r) => { if (r.source?.system === 'notion' && !r.localId && r.localNombre) r.localId = findLocal(r.localNombre); });
  }
  // Correos y mensajes: relación con un local solo si el nombre del local aparece literalmente (evidencia suficiente).
  if (locales.length) {
    store._mutate('mensajes', (m) => {
      if (m.source?.system !== 'graph' || m.localId) return;
      const hay = norm(`${m.asunto} ${m.extracto}`);
      const l = locales.find((x) => norm(x.nombre).length > 4 && hay.includes(norm(x.nombre)));
      if (l) { m.localId = l.id; m.localPorTexto = true; }
    });
  }
  // Agenda de Outlook (Graph o calendario publicado): enlace con el local si el evento lo dice.
  // Evidencia, de más a menos fuerte: la marca «restalia-local:<id>» que pone «Programar visita», la dirección del local
  // en la ubicación del evento, o el nombre completo del local en el título.
  if (locales.length) {
    const byId = new Set(locales.map((l) => l.id));
    const street = (l) => norm(String(l.direccion || '').split(',')[0]);
    store._mutate('eventos', (e) => {
      if (!['graph', 'ics'].includes(e.source?.system)) return;
      const mark = String(e.descripcion || '').match(/restalia-local:([\w-]+)/);
      let id = mark && byId.has(mark[1]) ? mark[1] : null, how = id ? 'marca' : null;
      if (!id && e.ubicacion) {
        // Varios locales comparten dirección (mismo centro comercial): se desempata por la marca o el prefijo del nombre en el título.
        const u = norm(e.ubicacion), t = norm(e.titulo);
        const cands = locales.filter((x) => street(x).length > 6 && u.includes(street(x)));
        const l = cands.length === 1 ? cands[0] : cands.find((x) => (x.marca && t.includes(norm(x.marca))) || t.includes(norm(x.nombre).split(' ')[0]));
        if (l) { id = l.id; how = 'direccion'; }
      }
      if (!id && e.titulo) { const t = norm(e.titulo); const l = locales.find((x) => norm(x.nombre).length > 6 && t.includes(norm(x.nombre))); if (l) { id = l.id; how = 'titulo'; } }
      e.localId = id; e.localPor = how;
    });
  }
  // Agenda: un evento de Outlook que ya está en Agenda Restalia (mismo id de Outlook, o mismo título y hora ±10 min) se oculta.
  const notionEv = store._raw('eventos').filter((e) => e.source?.system === 'notion');
  store._mutate('eventos', (e) => {
    if (!['graph', 'ics'].includes(e.source?.system)) return;
    const dup = notionEv.find((n) => (n.outlookId && e.source.ref.endsWith(n.outlookId)) ||
      (norm(n.titulo) === norm(e.titulo) && n.inicio && e.inicio && Math.abs(Date.parse(n.inicio) - Date.parse(e.inicio)) <= 6e5));
    e.hidden = !!dup;
    if (dup) dup.enOutlook = e.url || true;
  });
  // Conflictos: eventos reales (no cancelados ni de día completo) que se solapan.
  const evs = store._raw('eventos').filter((e) => !e.demo && !e.hidden && !e.allDay && !e.cancelado && e.inicio && e.fin).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const clash = new Set();
  for (let i = 0; i < evs.length; i++) for (let j = i + 1; j < evs.length && evs[j].inicio < evs[i].fin; j++) { clash.add(evs[i].id); clash.add(evs[j].id); }
  store._mutate('eventos', (e) => { e.conflicto = clash.has(e.id); });
  // Documentos: se conservan los más recientes en el dispositivo; el resto se busca en vivo.
  const docs = store._raw('documentos').filter((d) => d.source?.system === 'graph');
  if (docs.length > MAX_DOCS) {
    const keep = new Set(docs.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, MAX_DOCS).map((d) => d.id));
    store._replaceCollection('documentos', store._raw('documentos').filter((d) => d.source?.system !== 'graph' || keep.has(d.id)));
  }
}

/** Descarga los cambios pendientes. */
export async function pull() {
  let since = store.getSettings().syncCursor || '1970-01-01';
  let total = 0, guard = 0, more = true;
  while (more && guard++ < 20) {
    const r = await request(`/data?since=${encodeURIComponent(since)}`, { system: 'Sincronización', timeout: 30000 });
    const touched = store.applyRemote(r.records || []);
    total += Object.values(touched).reduce((a, b) => a + b, 0);
    if (r.cursor) since = r.cursor;
    more = !!r.more;
  }
  derive();
  const s = store.getSettings();
  const hasReal = store.stats && Object.values(store.stats().collections).some((c) => c.total - c.demo - c.local > 0);
  store.setSettings({ syncCursor: since, lastSync: new Date().toISOString(), ...(hasReal && !s.demoAutoHidden ? { showDemo: false, demoAutoHidden: true } : {}) });
  return total;
}

/** Pide al backend leer las fuentes (todas, o una: 'notion', 'graph:mail', 'notion:tareas'…) y descarga lo nuevo. */
export async function syncNow(source = null) {
  if (!backendConfigured() || state.busy) return null;
  state.busy = true; state.error = null; emit();
  try {
    const run = await request('/sync/run', { method: 'POST', body: source ? { source } : {}, system: 'Sincronización', timeout: 60000 });
    const n = await pull();
    state.lastSync = new Date().toISOString();
    return { run, changes: n };
  } catch (e) {
    state.error = e instanceof NotConnectedError ? 'Inicia sesión para sincronizar' : e.message;
    throw e;
  } finally { state.busy = false; emit(); }
}

export async function authStatus() {
  if (!backendConfigured()) return (state.auth = null);
  try { state.auth = await request('/auth/status', { system: 'Backend', timeout: 8000 }); } catch { state.auth = null; }
  emit();
  return state.auth;
}

async function quietPull() {
  if (!backendConfigured() || state.busy || document.visibilityState !== 'visible') return;
  state.busy = true; emit();
  try { await pull(); state.error = null; state.lastSync = new Date().toISOString(); } catch (e) { state.error = e instanceof NotConnectedError ? null : e.message; }
  finally { state.busy = false; emit(); }
}

/** Arranque: comprueba la sesión y, si la hay, descarga y programa la descarga periódica. */
export async function startAutoSync() {
  if (!backendConfigured()) return;
  const a = await authStatus();
  if (!a?.authenticated) return;
  await quietPull();
  setInterval(quietPull, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - Date.parse(store.getSettings().lastSync || 0) > 60000) quietPull(); });
}

export async function loginWithKey(key) {
  await request('/auth/key', { method: 'POST', body: { key }, system: 'Backend' });
  return authStatus();
}
export async function logout() {
  await request('/auth/logout', { method: 'POST', body: {}, system: 'Backend' });
  return authStatus();
}
/** Inicio de sesión con Microsoft (redirige a Entra ID y vuelve a la app). teams=true pide además leer canales de Teams. */
export const loginUrl = (teams = false) => `${backendUrl()}/auth/login${teams ? '?teams=1' : ''}`;
