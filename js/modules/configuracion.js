// Configuración (capa E): preferencias, estado real de las conexiones, proveedor de IA, datos e instalación.
import * as store from '../core/store.js';
import { icon, badge, pageHead, seg, bindSeg, field, openSheet, confirmSheet, toast, on } from '../core/ui.js';
import { esc, download } from '../core/utils.js';
import { LANGS } from '../core/i18n.js';
import { ADAPTERS, connectionStatus, notificationsAdapter } from '../adapters/index.js';
import { AI_PROVIDERS } from '../adapters/ai.js';
import { health, request, backendConfigured, backendUrl } from '../adapters/backend.js';
import * as sync from '../core/sync.js';
import { fmtDateTime, relTime } from '../core/utils.js';

// Dirección de la app conectada (Worker de Cloudflare que sirve esta misma app y su backend).
export const CONNECTED_URL = 'https://restalia-ops.hola-0d4.workers.dev/';
const SOURCE_LABEL = { 'notion:locales': 'Notion · Locales', 'notion:visitas': 'Notion · Visitas', 'notion:incidencias': 'Notion · Incidencias', 'notion:tareas': 'Notion · Acciones y seguimientos', 'notion:contactos': 'Notion · Contactos', 'notion:aprobaciones': 'Notion · Bandeja de aprobaciones', 'notion:historial': 'Notion · Historial de cambios', 'notion:registroIA': 'Notion · Registro del asistente IA', 'notion:agenda': 'Notion · Agenda Restalia', 'graph:calendar': 'Outlook · Calendario', 'graph:mail': 'Outlook · Correo', 'graph:teams': 'Teams', 'graph:files': 'OneDrive y SharePoint' };

const LAYERS = [
  { id: 'A', name: 'Datos operativos', src: 'Notion', cols: ['locales', 'visitas', 'incidencias', 'tareas', 'contactos', 'aprobaciones', 'actividad', 'eventos'] },
  { id: 'B', name: 'Datos corporativos', src: 'Microsoft 365', cols: ['mensajes', 'documentos', 'eventos'] },
  { id: 'C', name: 'Datos de la app', src: 'Esta app', cols: ['auditorias', 'proyectos', 'automatizaciones', 'plantillas'] },
  { id: 'D', name: 'Memoria del asistente', src: 'Este dispositivo', cols: [] },
  { id: 'E', name: 'Configuración', src: 'Este dispositivo', cols: [] },
];
const STATUS = { ok: ['Conectado', 'green'], error: ['Error', 'red'], off: ['No conectado', ''], local: ['Solo en este dispositivo', 'blue'] };
const ADAPTER_KEY = { notion: 'notion', graph: 'graph', ai: 'ai', storage: 'storage', notifications: 'notifications' };
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function section(title, ic, body, sub = '') {
  return `<section class="card" style="margin-top:16px"><div class="card-h"><h3>${icon(ic, 'sm')} ${esc(title)}</h3>${sub}</div><div class="card-b">${body}</div></section>`;
}

export default {
  id: 'configuracion', title: 'Configuración', icon: 'settings',
  render(view) {
    const s = store.getSettings();
    const stats = store.stats();
    const demoCount = Object.values(stats.collections).reduce((a, c) => a + c.demo, 0);
    const conv = store.ai.conversations().length, mem = store.ai.memory().length;

    view.innerHTML = `
      ${pageHead('Configuración', 'Preferencias, conexiones y datos de la app.')}

      ${section('Preferencias', 'user', `
        <div class="form">
          <div class="form-row">
            ${field({ label: 'Tu nombre', name: 'userName', value: s.userName, attrs: 'data-name autocomplete="given-name"' })}
            <div class="field"><label for="f-lang">Idioma</label><select id="f-lang" data-lang>${LANGS.map((l) => `<option value="${l.id}" ${l.id === s.lang ? 'selected' : ''}>${esc(l.label)}</option>`).join('')}</select></div>
          </div>
          <div class="field"><label>Apariencia</label>${seg('theme', [{ value: 'auto', label: 'Automática', icon: 'refresh' }, { value: 'light', label: 'Clara', icon: 'sun' }, { value: 'dark', label: 'Oscura', icon: 'moon' }], s.theme || 'auto')}</div>
        </div>`)}

      ${section('Instalar en el iPhone', 'phone', isStandalone()
        ? `<div class="notice">${icon('check')}<div>La app ya está instalada y abierta desde la pantalla de inicio.</div></div>`
        : `<ol style="margin:0;padding-left:20px;line-height:1.9">
            <li>Abre esta dirección en <b>Safari</b>.</li>
            <li>Pulsa <b>Compartir</b> ${icon('upload', 'sm')} en la barra inferior.</li>
            <li>Elige <b>Añadir a pantalla de inicio</b> y confirma con <b>Añadir</b>.</li>
            <li>Abre Restalia Ops desde el icono: se verá a pantalla completa, sin barras de Safari.</li>
          </ol>
          <p class="xs subtle" style="margin-bottom:0">En Android o en Chrome de escritorio, usa «Instalar aplicación» en el menú del navegador.</p>`)}

      ${section('Conexiones', 'plug', `
        <p class="small subtle" style="margin-top:0">La app nunca guarda contraseñas ni tokens. El backend seguro custodia los accesos a Notion, Microsoft 365 y la IA; el navegador solo lleva una cookie de sesión protegida.</p>
        <div data-session><div class="small subtle">Comprobando la sesión…</div></div>
        <div data-syncbox style="margin-top:14px"></div>
        <div class="list" style="margin-top:14px" data-adapters>${ADAPTERS.map((a) => `
          <div class="li" style="align-items:flex-start">
            <span class="li-icon">${icon({ notion: 'db', graph: 'globe', ai: 'sparkles', storage: 'folder', notifications: 'bell' }[a.id] || 'plug', 'sm')}</span>
            <div class="li-main"><div class="li-title">${esc(a.name)} <span class="xs subtle">· capa ${a.layer}</span></div>
              <div class="li-sub" style="white-space:normal">${esc(a.description)}</div>
              <div class="xs subtle" style="margin-top:4px;white-space:normal">Necesita: ${a.requires.map(esc).join(' · ')}</div></div>
            <span data-status="${ADAPTER_KEY[a.id]}">${badge('Comprobando…', '')}</span>
          </div>`).join('')}</div>
        <div class="btn-row" style="margin-top:12px;flex-wrap:wrap"><button class="btn sm" data-notioncheck>${icon('check', 'sm')}Comprobar conexión con Notion</button><button class="btn sm" data-schema>${icon('db', 'sm')}Esquema real de Notion</button><button class="btn sm" data-auditlog>${icon('history', 'sm')}Registro de auditoría</button></div>
        <details style="margin-top:12px"><summary class="small" style="cursor:pointer">Avanzado: dirección del backend</summary>
          <p class="xs subtle">Vacío = automático (la app conectada usa su propio dominio). Solo cámbialo si el backend está en otra dirección.</p>
          <div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap">
            <div class="field" style="flex:1;min-width:220px;margin:0"><label for="f-backend">Dirección del backend</label><input class="input" id="f-backend" type="url" inputmode="url" placeholder="Automática" value="${esc(s.backendUrl)}" data-backend></div>
            <button class="btn" data-savebackend>Guardar</button>
            <button class="btn" data-test>${icon('refresh', 'sm')}Probar</button>
          </div>
        </details>`, '<span class="xs subtle" data-backendstate></span>')}

      ${section('Asistente IA', 'sparkles', `
        <div class="form">
          <div class="form-row">
            <div class="field"><label for="f-ai">Proveedor</label><select id="f-ai" data-ai>${AI_PROVIDERS.map((p) => `<option value="${p.id}" ${p.id === s.aiProvider ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></div>
            ${field({ label: 'Modelo', name: 'aiModel', value: s.aiModel, placeholder: 'Lo decide el backend si se deja vacío', attrs: 'data-model' })}
          </div>
          <p class="xs subtle" style="margin:0">El proveedor se puede cambiar en cualquier momento. La clave vive en el backend, nunca aquí. Sin backend, el asistente usa el motor local de demostración.</p>
        </div>
        <div class="row wrap" style="gap:8px;margin-top:12px"><span class="small">${conv} conversaciones · ${mem} notas en memoria</span>
          <button class="btn sm" data-clearai style="margin-left:auto">${icon('trash', 'sm')}Borrar conversaciones y memoria</button></div>`)}

      ${section('Notificaciones', 'bell', `
        <p class="small" style="margin-top:0">Permiso en este dispositivo: <b data-perm>${esc({ granted: 'concedido', denied: 'denegado', default: 'sin decidir', unsupported: 'no disponible' }[notificationsAdapter.permission()])}</b></p>
        <p class="xs subtle">Los avisos con la app cerrada necesitan el backend (Web Push). En iPhone, además, la app debe estar instalada en la pantalla de inicio (iOS 16.4 o posterior).</p>
        <button class="btn sm" data-perm-ask ${notificationsAdapter.permission() === 'unsupported' ? 'disabled' : ''}>${icon('bell', 'sm')}Permitir notificaciones</button>`)}

      ${section('Datos', 'db', `
        <div style="overflow-x:auto"><table class="tbl">
          <thead><tr><th>Capa</th><th>Contenido</th><th>Fuente prevista</th><th style="text-align:right">Registros</th><th style="text-align:right">DEMO</th></tr></thead>
          <tbody>${LAYERS.map((l) => {
            const t = l.cols.reduce((a, c) => a + (stats.collections[c]?.total || 0), 0), d = l.cols.reduce((a, c) => a + (stats.collections[c]?.demo || 0), 0);
            const extra = l.id === 'D' ? `${conv + mem}` : l.id === 'E' ? '—' : t;
            return `<tr><td><b>${l.id}</b></td><td>${esc(l.name)}</td><td>${esc(l.src)}</td><td style="text-align:right">${extra}</td><td style="text-align:right">${l.cols.length ? d : '—'}</td></tr>`;
          }).join('')}</tbody></table></div>
        <p class="xs subtle">Todo se guarda en este dispositivo (${Math.round(stats.bytes / 1024)} KB más las fotos). Cada registro conserva su sistema de origen y su referencia para sincronizar sin duplicados.</p>
        <div class="row between" style="margin:14px 0;gap:12px"><div><div class="small"><b>Enviar mis visitas e incidencias a Notion al guardar</b></div><div class="xs subtle">Se crean en Notion al momento, sin pasar por Aprobaciones. Los cambios en registros que ya están en Notion siguen necesitando tu aprobación.</div></div>
          <label class="switch"><input type="checkbox" data-notiondirecto ${s.notionDirecto !== false ? 'checked' : ''} aria-label="Enviar mis visitas e incidencias a Notion al guardar"><span></span></label></div>
        <div class="row between" style="margin:14px 0;gap:12px"><div><div class="small"><b>Mostrar datos de ejemplo</b></div><div class="xs subtle">${demoCount} registros DEMO</div></div>
          <label class="switch"><input type="checkbox" data-showdemo ${s.showDemo ? 'checked' : ''} aria-label="Mostrar datos de ejemplo"><span></span></label></div>
        <div class="btn-row" style="flex-wrap:wrap">
          <button class="btn" data-export>${icon('download', 'sm')}Exportar copia</button>
          <label class="btn" style="cursor:pointer">${icon('upload', 'sm')}Importar copia<input type="file" accept="application/json,.json" hidden data-import></label>
          <button class="btn" data-reset>${icon('refresh', 'sm')}Restaurar ejemplos</button>
          <button class="btn" data-removedemo ${demoCount ? '' : 'disabled'}>Quitar ejemplos</button>
          <button class="btn danger" data-wipe>${icon('trash', 'sm')}Borrar todo</button>
        </div>`)}

      <p class="xs subtle" style="text-align:center;margin:20px 0 0">Restalia Operations AI · versión 0.2 (backend conectado)</p>`;

    const $ = (q) => view.querySelector(q);

    // Estado real de las conexiones (sin backend todo aparece «No conectado»).
    connectionStatus().then((st) => {
      if (!view.isConnected) return;
      Object.entries(ADAPTER_KEY).forEach(([, k]) => { const el = view.querySelector(`[data-status="${k}"]`); if (el) { const [t, c] = STATUS[st[k]] || STATUS.off; el.innerHTML = badge(t, c); } });
      $('[data-backendstate]').innerHTML = st.backend === 'off' ? 'Backend sin configurar' : st.backend === 'ok' ? '<span style="color:var(--green)">Backend accesible</span>' : '<span class="down">Backend no responde</span>';
    });

    // Sesión y sincronización con el backend
    const sessionEl = $('[data-session]'), syncEl = $('[data-syncbox]');
    const qs = new URLSearchParams(location.hash.split('?')[1] || '');
    if (qs.get('ms') === 'ok') toast('Microsoft 365 conectado', 'check');
    if (qs.get('ms') === 'error') toast(qs.get('msg') || 'No se pudo conectar Microsoft 365', 'alert');
    if (qs.get('ms')) history.replaceState(null, '', '#/configuracion');

    async function paintSession() {
      if (!backendConfigured()) {
        sessionEl.innerHTML = `<div class="notice">${icon('info')}<div>Estás en la versión sin conexión (datos solo en este dispositivo). Para usar los datos reales de Notion y Microsoft 365 abre la <a href="${CONNECTED_URL}" target="_blank" rel="noopener"><b>app conectada</b></a> e instálala en el iPhone desde allí.</div></div>`;
        syncEl.innerHTML = '';
        return;
      }
      const a = await sync.authStatus();
      if (!view.isConnected) return;
      if (!a) { sessionEl.innerHTML = `<div class="notice">${icon('alert')}<div>El backend no responde. Inténtalo de nuevo en unos minutos.</div></div>`; return; }
      if (!a.authenticated) {
        sessionEl.innerHTML = `<div class="notice">${icon('lock')}<div><b>Inicia sesión</b> para ver tus datos reales.</div></div>
          <div class="btn-row" style="margin-top:10px;flex-wrap:wrap">
            ${a.entraConfigured ? `<a class="btn primary" href="${esc(sync.loginUrl())}">${icon('globe', 'sm')}Entrar con Microsoft 365</a>` : `<span class="xs subtle">Microsoft 365: pendiente del registro de la app en Entra ID.</span>`}
          </div>
          ${a.keyLogin ? `<form class="row" data-keyform style="gap:8px;margin-top:10px;flex-wrap:wrap;align-items:flex-end"><div class="field" style="flex:1;min-width:200px;margin:0"><label for="f-key">Llave de acceso provisional</label><input class="input" id="f-key" type="password" autocomplete="current-password" required minlength="24"></div><button class="btn">Entrar con llave</button></form>` : (!a.entraConfigured ? `<div class="notice" style="margin-top:10px">${icon('info')}<div><b>No hay ninguna forma de entrar todavía.</b> La llave de acceso está desactivada: en Cloudflare, el secreto <code>ACCESS_KEY</code> del Worker debe tener 24 caracteres o más. También puedes completar el registro de Microsoft 365 (<code>MS_CLIENT_ID</code> y <code>MS_CLIENT_SECRET</code>).</div></div>` : '')}`;
        return;
      }
      const ms = a.microsoft || {};
      const teamsOk = (ms.scopes || []).includes('ChannelMessage.Read.All');
      sessionEl.innerHTML = `<div class="li" style="border:0;padding:0"><span class="li-icon green">${icon('check', 'sm')}</span><div class="li-main"><div class="li-title">Sesión iniciada · ${esc(a.user || '')}</div>
          <div class="li-sub" style="white-space:normal">${a.via === 'key' ? 'Con llave provisional' : 'Con Microsoft 365'} · Microsoft 365 ${ms.connected ? `conectado (${esc((ms.scopes || []).join(', '))})` : 'sin conectar'}</div></div></div>
        <div class="btn-row" style="margin-top:10px;flex-wrap:wrap">
          ${!ms.connected && a.entraConfigured ? `<a class="btn primary sm" href="${esc(sync.loginUrl())}">${icon('globe', 'sm')}Conectar Microsoft 365</a>` : ''}
          ${ms.connected && !teamsOk ? `<a class="btn sm" href="${esc(sync.loginUrl(true))}" title="Solo cuando TI haya dado el consentimiento">${icon('teams', 'sm')}Activar canales de Teams</a>` : ''}
          ${ms.connected ? `<button class="btn sm" data-msoff>Desconectar Microsoft 365</button>` : ''}
          <button class="btn sm" data-logout>Cerrar sesión</button>
        </div>`;
      paintSync();
    }

    async function paintSync() {
      let st = null;
      try { st = await request('/sync/status', { system: 'Sincronización' }); } catch { /* sin sesión */ }
      if (!view.isConnected || !st) return;
      const ls = store.getSettings().lastSync;
      syncEl.innerHTML = `<div class="row between" style="gap:8px;flex-wrap:wrap"><div class="small"><b>Sincronización</b> <span class="xs subtle">· en este dispositivo: ${ls ? esc(relTime(ls)) : 'nunca'} · automática cada 15 min en el servidor</span></div>
          <button class="btn primary sm" data-syncnow ${sync.state.busy ? 'disabled' : ''}>${icon('refresh', 'sm')}${sync.state.busy ? 'Actualizando…' : 'Actualizar ahora'}</button></div>
        <div style="overflow-x:auto;margin-top:8px"><table class="tbl"><thead><tr><th>Fuente</th><th>Última correcta</th><th style="text-align:right">Registros</th><th>Estado</th><th></th></tr></thead><tbody>
        ${st.sources.map((x) => { const n = (st.counts || []).filter((c) => (x.source.startsWith('notion') ? c.system === 'notion' : c.system === 'graph')).length; return `<tr>
          <td class="small">${esc(SOURCE_LABEL[x.source] || x.source)}</td><td class="small">${x.last_ok ? esc(relTime(x.last_ok)) : '—'}</td><td class="small" style="text-align:right">${x.items ?? '—'}</td>
          <td class="small">${x.last_error ? `<span class="down" title="${esc(x.last_error)}">${esc(x.last_error.slice(0, 70))}</span>` : x.pending ? 'En curso' : x.last_ok ? '<span style="color:var(--green)">Correcta</span>' : '<span class="subtle">Sin datos aún</span>'}</td>
          <td><button class="btn ghost sm" data-syncone="${esc(x.source)}" aria-label="Actualizar ${esc(SOURCE_LABEL[x.source] || x.source)}">${icon('refresh', 'sm')}</button></td></tr>`; }).join('')}
        </tbody></table></div>`;
    }
    paintSession();
    const offSync = sync.onSync(() => { if (!view.isConnected) return offSync(); const b = view.querySelector('[data-syncnow]'); if (b) { b.disabled = sync.state.busy; b.lastChild.textContent = sync.state.busy ? 'Actualizando…' : 'Actualizar ahora'; } });

    on(view, 'submit', '[data-keyform]', async (e, f) => {
      e.preventDefault();
      try { await sync.loginWithKey(f.querySelector('input').value); toast('Sesión iniciada', 'check'); paintSession(); sync.syncNow().catch(() => {}); } catch (err) { toast(err.message, 'alert'); }
    });
    on(view, 'click', '[data-logout]', async () => { await sync.logout().catch(() => {}); toast('Sesión cerrada'); paintSession(); });
    on(view, 'click', '[data-msoff]', async () => {
      if (!(await confirmSheet({ title: 'Desconectar Microsoft 365', text: 'Se borran del backend los permisos guardados y se detiene la lectura de correo, calendario, Teams y archivos. No se borra nada en Microsoft 365.', confirm: 'Desconectar', danger: true }))) return;
      await request('/auth/disconnect', { method: 'POST', body: {}, system: 'Microsoft 365' }).catch((e) => toast(e.message, 'alert'));
      paintSession();
    });
    const runSync = async (source) => {
      try { const r = await sync.syncNow(source); const errs = Object.values(r?.run?.results || {}).filter((x) => x.error); toast(errs.length ? `Actualizado con ${errs.length} aviso(s)` : `Actualizado · ${r?.changes || 0} cambios`, errs.length ? 'alert' : 'check'); }
      catch (e) { toast(e.message, 'alert'); }
      if (view.isConnected) paintSync();
    };
    on(view, 'click', '[data-syncnow]', () => runSync());
    on(view, 'click', '[data-syncone]', (e, b) => runSync(b.dataset.syncone));
    // Comprobación de extremo a extremo: Notion en vivo frente a la copia del backend (no basta con /api/health).
    on(view, 'click', '[data-notioncheck]', async (e, b) => {
      let r;
      b.disabled = true;
      try { r = await request('/notion/check', { system: 'Notion', timeout: 30000 }); } catch (err) { toast(err.message, 'alert'); return; } finally { b.disabled = false; }
      const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
      openSheet({ title: 'Conexión con Notion', body: r.ok ? `<div class="notice info">${icon('check')}<div><b>Conexión correcta.</b> Notion respondió en ${r.ms} ms.</div></div>
        <dl class="props" style="margin-top:12px">${row('Locales en Notion', `${r.notion.locales}${r.notion.complete ? '' : '+'}`)}${row('Locales en la app (backend)', r.backend.locales)}
        ${row('Con «Responsable asignado»', r.notion.conResponsableAsignado)}${row('Última sincronización', r.backend.lastSync ? esc(fmtDateTime(r.backend.lastSync)) : '—')}
        ${row('Coinciden', r.inSync == null ? '—' : r.inSync ? badge('Sí', 'green') : badge('No: pulsa Actualizar ahora', 'amber'))}
        ${r.sample ? row('Ejemplo', `${esc(r.sample.nombre)}<br><span class="small subtle">${[r.sample.marca, r.sample.municipio, r.sample.zona, r.sample.responsableAsignado && 'Responsable: ' + r.sample.responsableAsignado].filter(Boolean).map(esc).join(' · ')}</span>`) : ''}</dl>`
        : `<div class="notice">${icon('alert')}<div><b>Sin conexión con Notion.</b> ${esc(r.error || 'Error desconocido')}</div></div>` });
    });
    on(view, 'click', '[data-schema]', async () => {
      let r;
      try { r = await request('/notion/schema', { system: 'Notion', timeout: 45000 }); } catch (e) { toast(e.message, 'alert'); return; }
      openSheet({ title: 'Esquema real de Notion', body: `<p class="xs subtle" style="margin-top:0">Leído ahora de Notion (API ${esc(r.notionVersion)}). «Sin propiedad» = la app no lo rellena porque esa propiedad no existe en la base.</p>
        ${r.collections.map((c) => c.error ? `<div class="notice" style="margin:8px 0">${icon('alert')}<div><b>${esc(c.collection)}</b>: ${esc(c.error)}</div></div>` : `
          <details style="margin:8px 0"><summary><b>${esc(c.name)}</b> <span class="xs subtle">· ${Object.keys(c.properties).length} propiedades${c.missing.length ? ` · ${c.missing.length} campos sin propiedad` : ''}</span></summary>
          <table class="tbl" style="margin-top:6px"><thead><tr><th>Campo de la app</th><th>Propiedad en Notion</th></tr></thead><tbody>${Object.entries(c.mapping).map(([k, m]) => `<tr><td class="small">${esc(k)}</td><td class="small">${m ? `${esc(m.property)} <span class="xs subtle">(${esc(m.type)})</span>` : '<span class="subtle">Sin propiedad</span>'}</td></tr>`).join('')}</tbody></table>
          <p class="xs subtle">Propiedades sin usar: ${c.unmapped.map(esc).join(', ') || 'ninguna'}</p>
          ${Object.entries(c.properties).filter(([, p]) => p.options.length).map(([k, p]) => `<p class="xs" style="margin:2px 0"><b>${esc(k)}</b>: ${p.options.map(esc).join(' · ')}</p>`).join('')}</details>`).join('')}` });
    });
    on(view, 'click', '[data-auditlog]', async () => {
      let r;
      try { r = await request('/audit', { system: 'Backend' }); } catch (e) { toast(e.message, 'alert'); return; }
      openSheet({ title: 'Registro de auditoría', body: `<p class="xs subtle" style="margin-top:0">Inicios de sesión, sincronizaciones y acciones ejecutadas. No incluye contenido de correos ni secretos.</p><div class="list">${r.items.map((x) => `<div class="li"><div class="li-main"><div class="li-title small">${esc(x.action)} · ${esc(x.result || '')}</div><div class="li-sub">${esc(fmtDateTime(x.at))} · ${esc(x.actor || '')}${x.detail ? ' · ' + esc(x.detail) : ''}</div></div></div>`).join('') || '<p class="small subtle">Sin entradas.</p>'}</div>` });
    });

    // Preferencias
    $('[data-name]').addEventListener('change', (e) => { const v = e.target.value.trim(); if (v) { store.setSettings({ userName: v }); toast('Nombre guardado'); } });
    $('[data-lang]').addEventListener('change', (e) => { store.setSettings({ lang: e.target.value }); toast(e.target.value === 'en' ? 'Language changed (navigation)' : 'Idioma cambiado'); });
    bindSeg(view, 'theme', (v) => store.setSettings({ theme: v }));

    // Conexiones
    $('[data-savebackend]').addEventListener('click', () => {
      const v = $('[data-backend]').value.trim();
      if (v && !/^https:\/\/[^\s/]+/i.test(v)) { toast('Debe empezar por https://', 'alert'); return; }
      store.setSettings({ backendUrl: v }); toast(v ? 'Dirección guardada' : 'Backend eliminado');
    });
    $('[data-test]').addEventListener('click', async (e) => {
      if (!backendConfigured()) { toast('No hay backend: abre la app conectada', 'info'); return; }
      e.currentTarget.disabled = true;
      const h = await health();
      toast(h ? 'El backend responde' : 'El backend no responde', h ? 'check' : 'alert');
      if (view.isConnected) e.currentTarget.disabled = false;
    });

    // IA
    $('[data-ai]').addEventListener('change', (e) => { store.setSettings({ aiProvider: e.target.value }); toast('Proveedor guardado'); });
    $('[data-model]').addEventListener('change', (e) => store.setSettings({ aiModel: e.target.value.trim() }));
    $('[data-clearai]').addEventListener('click', async () => {
      if (!(await confirmSheet({ title: 'Borrar conversaciones y memoria', text: 'Se eliminan del dispositivo. No se puede deshacer.', confirm: 'Borrar', danger: true }))) return;
      store.ai.conversations().map((c) => c.id).forEach((id) => store.ai.remove(id));
      store.ai.memory().map((m) => m.id).forEach((id) => store.ai.forget(id));
      toast('Asistente reiniciado'); window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    // Notificaciones
    $('[data-perm-ask]').addEventListener('click', async () => {
      const r = await notificationsAdapter.askPermission();
      $('[data-perm]').textContent = { granted: 'concedido', denied: 'denegado', default: 'sin decidir', unsupported: 'no disponible' }[r] || r;
      toast(r === 'granted' ? 'Permiso concedido' : 'Permiso no concedido', r === 'granted' ? 'check' : 'info');
    });

    // Datos
    $('[data-showdemo]').addEventListener('change', (e) => { store.setSettings({ showDemo: e.target.checked }); });
    $('[data-notiondirecto]').addEventListener('change', (e) => { store.setSettings({ notionDirecto: e.target.checked }); });
    $('[data-export]').addEventListener('click', () => { download(`restalia-copia-${new Date().toISOString().slice(0, 10)}.json`, store.exportAll(), 'application/json'); toast('Copia descargada', 'download'); });
    $('[data-import]').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (!(await confirmSheet({ title: 'Importar copia', text: `Se sustituirán los datos actuales por los de «${f.name}».`, confirm: 'Importar', danger: true }))) { e.target.value = ''; return; }
      try { store.importAll(await f.text()); toast('Copia importada'); } catch (err) { toast(err.message, 'alert'); }
    });
    $('[data-reset]').addEventListener('click', async () => { if (await confirmSheet({ title: 'Restaurar ejemplos', text: 'Se borran tus registros y se cargan de nuevo los datos DEMO.', confirm: 'Restaurar', danger: true })) { store.resetDemo(); toast('Ejemplos restaurados'); } });
    $('[data-removedemo]').addEventListener('click', async () => { if (await confirmSheet({ title: 'Quitar ejemplos', text: `Se eliminan ${demoCount} registros DEMO. Tus registros se mantienen.`, confirm: 'Quitar', danger: true })) { store.removeDemo(); toast('Ejemplos eliminados'); } });
    $('[data-wipe]').addEventListener('click', async () => { if (await confirmSheet({ title: 'Borrar todo', text: 'Se eliminan todos los datos, conversaciones y memoria de este dispositivo. No afecta a Notion ni a Microsoft 365.', confirm: 'Borrar todo', danger: true })) { store.wipe(); toast('Datos borrados'); } });
  },
};
