import * as store from '../core/store.js';
import { icon, badge, demoBadge, empty, pageHead, seg, bindSeg, demoNotice, on, scoreCls, toast, openSheet, field, readForm } from '../core/ui.js';
import { esc, matches, norm, fmtDate, fmtDateFull, relDay, isOverdue, toDate, debounce } from '../core/utils.js';
import { state as syncState, onSync, syncNow } from '../core/sync.js';
import { backendConfigured } from '../adapters/backend.js';

const st = { view: 'tabla', q: '', marca: '', estado: '', municipio: '', zona: '', responsable: '', tab: 'resumen' };
const SIN_ESTADO = '__sin_estado';
// Opciones de «Estado» de la base Locales de Notion. El backend vuelve a validarlas contra el esquema real antes de escribir.
const ESTADOS_NOTION = ['Pendiente de asignación', 'Activo', 'En seguimiento', 'Inactivo'];

// Campos tolerantes: los locales de Notion traen «Municipio» y «Responsable asignado»; los DEMO, «ciudad» y «responsable».
const muni = (l) => l.municipio || l.ciudad || '';
const resp = (l) => l.responsableAsignado || l.responsable || '';
const estadoBadge = (l) => (l.estado ? badge(l.estado) : '<span class="badge">Sin estado</span>');
const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

/** Enlace de Google Maps (gratis, sin clave). En iPhone abre la app de Google Maps si está instalada. */
export function googleMapsUrl(l) {
  const m = muni(l);
  const dir = l.direccion ? (m && !norm(l.direccion).includes(norm(m)) ? `${l.direccion}, ${m}` : l.direccion) : '';
  const q = dir || (l.lat != null && l.lng != null ? `${l.lat},${l.lng}` : [l.nombre, m].filter(Boolean).join(', '));
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** Destino para navegar: la dirección si existe (más fiable) o las coordenadas. */
function destino(l) {
  const m = muni(l);
  if (l.direccion) return m && !norm(l.direccion).includes(norm(m)) ? `${l.direccion}, ${m}` : l.direccion;
  if (l.lat != null && l.lng != null) return `${l.lat},${l.lng}`;
  return [l.nombre, m].filter(Boolean).join(', ');
}
/** «Cómo llegar» en Google Maps: abre la ruta en coche desde la ubicación actual (app si está instalada). */
export const googleDirectionsUrl = (l) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino(l))}&travelmode=driving`;
/** «Ir con Waze»: usa las coordenadas exactas si las hay y, si no, la dirección. Abre la app de Waze si está instalada. */
export function wazeUrl(l) {
  const exact = l.lat != null && l.lng != null && l.geoPrecision !== 'municipio';
  return exact ? `https://waze.com/ul?ll=${l.lat},${l.lng}&navigate=yes` : `https://waze.com/ul?q=${encodeURIComponent(destino(l))}&navigate=yes`;
}
/** Botones «Cómo llegar» (Google Maps y Waze). */
export const navButtons = (l, cls = 'btn sm') => `<div class="btn-row nav-btns">
  <a class="${cls} primary" href="${googleDirectionsUrl(l)}" target="_blank" rel="noopener">${icon('pin', 'sm')} Ir con Google Maps</a>
  <a class="${cls}" href="${wazeUrl(l)}" target="_blank" rel="noopener">${icon('pin', 'sm')} Ir con Waze</a></div>`;

// ---------- Mapa (Leaflet + OpenStreetMap, gratis y sin clave) ----------
const LEAFLET = { css: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css', js: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js' };
const BRAND_COLORS = { '100 Montaditos': '#e07a10', 'The Good Burger': '#d6332a', 'Cervecería La Sureña': '#1d5bff', 'Mercado La Sureña': '#0e9aa7', 'Panther Organic Coffee': '#1f9d55', 'Pepe Taco': '#8b3fd9' };
const brandColor = (m) => BRAND_COLORS[m] || '#6b7280';
let leafletP = null, mapInst = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletP) return leafletP;
  leafletP = new Promise((resolve, reject) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = LEAFLET.css; document.head.appendChild(css);
    const js = document.createElement('script'); js.src = LEAFLET.js; js.async = true;
    js.onload = () => resolve(window.L); js.onerror = () => { leafletP = null; reject(new Error('No se pudo cargar el mapa')); };
    document.head.appendChild(js);
  });
  return leafletP;
}
const hasCoords = (l) => Number.isFinite(l.lat) && Number.isFinite(l.lng);

/** Pinta el mapa con los locales filtrados. Los locales en el mismo punto (p. ej. un centro comercial) se separan un poco. */
async function renderMap(el, items) {
  if (mapInst) { mapInst.remove(); mapInst = null; }
  let L;
  try { L = await loadLeaflet(); } catch (e) {
    el.innerHTML = `<div class="notice" style="margin:12px">${icon('alert')}<div><b>No se pudo cargar el mapa.</b> Comprueba la conexión a internet. La tabla y las fichas siguen disponibles.</div></div>`; return;
  }
  if (!el.isConnected) return;
  mapInst = L.map(el, { zoomControl: true, scrollWheelZoom: true, tap: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(mapInst);
  const located = items.filter(hasCoords);
  const groups = new Map();
  for (const l of located) { const k = `${l.lat.toFixed(4)},${l.lng.toFixed(4)}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(l); }
  const pts = [];
  for (const g of groups.values()) g.forEach((l, i) => {
    const a = (2 * Math.PI * i) / g.length, d = g.length > 1 ? 0.00035 : 0;
    const ll = [l.lat + d * Math.sin(a), l.lng + d * Math.cos(a)];
    pts.push(ll);
    const aprox = l.geoPrecision === 'municipio';
    L.circleMarker(ll, { radius: 9, color: '#ffffff', weight: 2, fillColor: brandColor(l.marca), fillOpacity: aprox ? 0.55 : 0.95, dashArray: aprox ? '3' : null })
      .bindPopup(`<div class="map-pop"><b>${esc(l.nombre)}</b><div class="small subtle">${[l.marca, muni(l)].filter(Boolean).map(esc).join(' · ')}</div>
        ${aprox ? '<div class="xs subtle">Ubicación aproximada (municipio)</div>' : ''}
        <div style="margin-top:6px"><a href="#/locales/${esc(l.id)}">Ver ficha</a> · <a href="${googleDirectionsUrl(l)}" target="_blank" rel="noopener">Ir con Google Maps</a> · <a href="${wazeUrl(l)}" target="_blank" rel="noopener">Ir con Waze</a></div></div>`)
      .addTo(mapInst);
  });
  if (pts.length) mapInst.fitBounds(pts, { padding: [28, 28], maxZoom: 15 });
  else mapInst.setView([40.4168, -3.7038], 9); // Madrid por defecto
  setTimeout(() => mapInst?.invalidateSize(), 60);
}

const pendingFor = (l) => store.all('aprobaciones').find((a) => a.estado === 'Pendiente' && a.op?.collection === 'locales' && a.op?.ref === l.source?.ref);

/** Estado de la conexión con datos reales: carga, sin sesión o error, con opción de reintentar. */
function connectionNotice(all) {
  const real = all.filter((l) => l.source?.system === 'notion').length;
  if (syncState.busy) return `<div class="notice info" role="status">${icon('refresh')}<div>Sincronizando con Notion…</div></div>`;
  if (!backendConfigured()) return real ? '' : `<div class="notice info">${icon('info')}<div>Esta copia de la app funciona sin conexión. Para ver los locales reales de Notion abre la app conectada (dirección del Worker).</div></div>`;
  if (syncState.error) return `<div class="notice" role="alert">${icon('alert')}<div><b>No se pudieron actualizar los locales.</b> ${esc(syncState.error)}${real ? ` Se muestran los ${real} locales de la última sincronización.` : ''} <button class="btn sm" data-retry style="margin-left:6px">Reintentar</button></div></div>`;
  if (syncState.auth && !syncState.auth.authenticated && !real) return `<div class="notice info">${icon('lock')}<div><b>Inicia sesión</b> en <a href="#/configuracion">Configuración</a> para cargar los locales de Notion.</div></div>`;
  return '';
}

function list(view) {
  const all = store.all('locales');
  const marcas = uniq(all.map((l) => l.marca));
  const estados = uniq(all.map((l) => l.estado));
  const municipios = uniq(all.map(muni));
  const zonas = uniq(all.map((l) => l.zona));
  const responsables = uniq(all.map(resp));
  const conCodigo = all.some((l) => l.codigo);
  const openInc = (id) => store.all('incidencias').filter((i) => i.localId === id && !['Resuelta', 'Cerrada'].includes(i.estado)).length;
  const lastVisit = (id) => store.all('visitas').filter((v) => v.localId === id).sort((a, b) => toDate(b.fecha) - toDate(a.fecha))[0];
  const lastVisitDate = (l) => lastVisit(l.id)?.fecha || l.ultimaVisita || null;
  const lastAudit = (id) => store.all('auditorias').filter((a) => a.localId === id && a.puntuacion != null).sort((a, b) => toDate(b.fecha) - toDate(a.fecha))[0];
  const filtered = () => all.filter((l) => (!st.marca || l.marca === st.marca)
    && (!st.estado || (st.estado === SIN_ESTADO ? !l.estado : l.estado === st.estado))
    && (!st.municipio || muni(l) === st.municipio) && (!st.zona || l.zona === st.zona) && (!st.responsable || resp(l) === st.responsable)
    && matches({ ...l, _muni: muni(l), _resp: resp(l) }, st.q, ['nombre', 'codigo', '_muni', 'zona', 'direccion', '_resp', 'gerente', 'marca']));
  const anyFilter = () => st.q || st.marca || st.estado || st.municipio || st.zona || st.responsable;

  const paint = () => {
    const items = filtered();
    const body = view.querySelector('#l-body');
    view.querySelector('#l-count').textContent = `${items.length} de ${all.length}`;
    view.querySelector('#l-clear').hidden = !anyFilter();
    if (!all.length) { body.innerHTML = `<div class="card">${empty(syncState.busy ? 'Cargando locales…' : 'Todavía no hay locales', 'store')}</div>`; return; }
    if (st.view !== 'mapa' && mapInst) { mapInst.remove(); mapInst = null; }
    if (!items.length) { if (mapInst) { mapInst.remove(); mapInst = null; } body.innerHTML = `<div class="card">${empty('Ningún local coincide con los filtros', 'store')}</div>`; return; }
    if (st.view === 'mapa') {
      const sin = items.filter((l) => !hasCoords(l));
      const marcasVis = uniq(items.filter(hasCoords).map((l) => l.marca || 'Sin marca'));
      body.innerHTML = `<div class="card map-card"><div id="l-map" class="map" role="region" aria-label="Mapa de locales"></div>
        <div class="map-legend">${marcasVis.map((m) => `<span><i style="background:${brandColor(m)}"></i>${esc(m)} · ${items.filter((l) => hasCoords(l) && (l.marca || 'Sin marca') === m).length}</span>`).join('')}</div></div>
        ${sin.length ? `<div class="card pad" style="margin-top:12px"><div class="small"><b>${sin.length} ${sin.length === 1 ? 'local sin ubicar' : 'locales sin ubicar'} todavía.</b> <span class="subtle">Se sitúan solos a partir de su dirección en las próximas sincronizaciones.</span></div>
          <div class="list" style="margin-top:8px">${sin.map((l) => `<div class="li" data-href="#/locales/${l.id}"><span class="li-icon">${icon('pin', 'sm')}</span><div class="li-main"><div class="li-title">${esc(l.nombre)}</div><div class="li-sub">${esc(l.direccion || 'Sin dirección')}</div></div></div>`).join('')}</div></div>` : ''}`;
      renderMap(body.querySelector('#l-map'), items);
      return;
    }
    body.innerHTML = st.view === 'tabla' ? `<div class="card table-wrap"><table class="tbl mobile-list"><thead><tr><th>Local</th>${conCodigo ? '<th>Código</th>' : ''}<th>Marca</th><th>Municipio</th><th>Zona</th><th>Responsable</th><th>Estado</th><th>Incidencias</th><th>Última visita</th><th>Auditoría</th></tr></thead><tbody>
      ${items.map((l) => { const v = lastVisitDate(l), a = lastAudit(l.id), n = openInc(l.id); return `<tr data-href="#/locales/${l.id}">
        <td class="primary">${esc(l.nombre)} ${demoBadge(l)}</td>${conCodigo ? `<td class="mono">${esc(l.codigo || '—')}</td>` : ''}<td>${esc(l.marca || '—')}</td><td>${esc(muni(l) || '—')}</td><td class="hide-m">${esc(l.zona || '—')}</td><td class="hide-m">${esc(resp(l) || '—')}</td>
        <td>${estadoBadge(l)}</td><td>${n ? badge(`${n} abiertas`, 'red') : '<span class="subtle">0</span>'}</td><td class="hide-m">${v ? relDay(v) : '—'}</td>
        <td>${a ? `<span class="score ${scoreCls(a.puntuacion)}">${a.puntuacion}</span>` : '—'}</td></tr>`; }).join('')}
      </tbody></table></div>`
      : `<div class="cards">${items.map((l) => { const n = openInc(l.id), a = lastAudit(l.id); return `<div class="card pad click" data-href="#/locales/${l.id}">
        <div class="row between"><span class="li-icon blue">${icon('store')}</span>${estadoBadge(l)}</div>
        <h3 style="margin:12px 0 2px">${esc(l.nombre)}</h3><div class="small subtle">${[l.marca, l.codigo, muni(l), l.zona].filter(Boolean).map(esc).join(' · ')}</div>
        <div class="row wrap" style="margin-top:12px;gap:6px">${demoBadge(l)}${n ? badge(`${n} incidencias`, 'red') : badge('Sin incidencias', 'green')}${a ? badge(`Auditoría ${a.puntuacion}`, a.puntuacion >= 85 ? 'green' : a.puntuacion >= 70 ? 'amber' : 'red') : ''}</div>
        <div class="small muted" style="margin-top:10px">${icon('user', 'sm')} ${esc(resp(l) || 'Sin responsable asignado')}</div>
        <div style="margin-top:12px">${navButtons(l)}</div></div>`; }).join('')}</div>`;
  };

  const sel = (id, label, all, cur, opts = []) => `<select class="sel" id="${id}" aria-label="${label}"><option value="">${label}</option>${opts.join('')}${all.map((m) => `<option ${m === cur ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>`;
  view.innerHTML = `
    ${pageHead('Locales', 'Cartera de locales desde Notion: ficha operativa, visitas, incidencias, auditorías, acciones y documentos.', seg('lview', [{ value: 'tabla', label: 'Tabla', icon: 'table' }, { value: 'tarjetas', label: 'Tarjetas', icon: 'grid' }, { value: 'mapa', label: 'Mapa', icon: 'map' }], st.view))}
    <div id="l-conn">${connectionNotice(all)}</div>
    ${all.some((r) => r.demo) ? demoNotice('<b>Locales ficticios.</b> Los locales reales llegarán desde la base «Locales» de Notion. La app no crea locales para no duplicar el CRM existente.') : ''}
    <div class="toolbar wrap" style="margin-top:14px">
      <div class="search">${icon('search', 'sm')}<input id="l-q" type="search" placeholder="Buscar por nombre, municipio, dirección…" value="${esc(st.q)}"></div>
      ${sel('l-marca', 'Todas las marcas', marcas, st.marca)}
      ${sel('l-municipio', 'Todos los municipios', municipios, st.municipio)}
      ${sel('l-zona', 'Todas las zonas', zonas, st.zona)}
      ${sel('l-responsable', 'Todos los responsables', responsables, st.responsable)}
      ${sel('l-estado', 'Todos los estados', estados, st.estado, all.some((l) => !l.estado) ? [`<option value="${SIN_ESTADO}" ${st.estado === SIN_ESTADO ? 'selected' : ''}>Sin estado</option>`] : [])}
      <button class="btn ghost sm" id="l-clear" hidden>Limpiar filtros</button>
      <span class="xs subtle" id="l-count" style="margin-left:auto"></span>
    </div>
    <div id="l-body"></div>`;
  paint();
  bindSeg(view, 'lview', (v) => { st.view = v; view.querySelectorAll('[data-seg="lview"] button').forEach((b) => b.classList.toggle('on', b.dataset.val === v)); paint(); });
  view.querySelector('#l-q').addEventListener('input', debounce((e) => { st.q = e.target.value; paint(); }, 150));
  for (const k of ['marca', 'municipio', 'zona', 'responsable', 'estado']) view.querySelector(`#l-${k}`).addEventListener('change', (e) => { st[k] = e.target.value; paint(); });
  view.querySelector('#l-clear').addEventListener('click', () => { Object.assign(st, { q: '', marca: '', estado: '', municipio: '', zona: '', responsable: '' }); list(view); });
  view.querySelector('#l-conn').addEventListener('click', (e) => { if (e.target.closest('[data-retry]')) syncNow('notion:locales').catch(() => {}); });
  // Refresca el aviso de conexión mientras la vista está abierta.
  const off = onSync(() => { if (!view.isConnected || !view.querySelector('#l-conn')) return off(); view.querySelector('#l-conn').innerHTML = connectionNotice(store.all('locales')); });
}

/** Propuesta de cambio de un local de Notion (Estado, Próxima visita, Notas generales). Se ejecuta solo tras aprobarla. */
function proposeChange(l, rerender) {
  openSheet({
    title: 'Proponer cambio en Notion',
    body: `<form class="form" id="lc-form">
      <p class="small subtle" style="margin-top:0">El cambio se guarda como propuesta en Aprobaciones. Notion solo se modifica cuando la apruebes y si las escrituras están activadas en el backend.</p>
      ${field({ label: 'Estado', name: 'estado', options: [{ value: '', label: 'Sin estado' }, ...ESTADOS_NOTION], value: l.estado || '' })}
      ${field({ label: 'Próxima visita', name: 'proximaVisita', type: 'date', value: l.proximaVisita ? String(l.proximaVisita).slice(0, 10) : '' })}
      ${field({ label: 'Notas generales', name: 'notasGenerales', type: 'textarea', rows: 4, value: l.notasGenerales || '' })}
    </form>`,
    footer: '<button class="btn" data-close>Cancelar</button><button class="btn primary" data-ok>Crear propuesta</button>',
    onMount(el, close) {
      el.querySelector('[data-ok]').addEventListener('click', () => {
        const f = readForm(el.querySelector('#lc-form'));
        const changes = {};
        if (f.estado && f.estado !== (l.estado || '')) changes.estado = f.estado;
        if (f.proximaVisita && f.proximaVisita !== String(l.proximaVisita || '').slice(0, 10)) changes.proximaVisita = f.proximaVisita;
        if (f.notasGenerales && f.notasGenerales !== (l.notasGenerales || '')) changes.notasGenerales = f.notasGenerales;
        if (!Object.keys(changes).length) { toast('No hay cambios que proponer'); return; }
        store.update('locales', l.id, changes);
        close(); toast('Propuesta creada en Aprobaciones'); rerender();
      });
    },
  });
}

function detail(view, id) {
  const l = store.find('locales', id);
  if (!l) { view.innerHTML = `<div class="card" style="margin-top:20px">${empty('Este local no existe o se ha eliminado', 'store')}</div>`; return; }
  const m = muni(l);
  const visitas = store.all('visitas').filter((v) => v.localId === id).sort((a, b) => toDate(b.fecha) - toDate(a.fecha));
  const inc = store.all('incidencias').filter((v) => v.localId === id).sort((a, b) => toDate(b.fecha) - toDate(a.fecha));
  const aud = store.all('auditorias').filter((v) => v.localId === id).sort((a, b) => toDate(b.fecha) - toDate(a.fecha));
  const tareas = store.all('tareas').filter((v) => v.localId === id && !['Hecha', 'Cancelada'].includes(v.estado));
  const nm = norm(m);
  const docs = store.all('documentos').filter((d) => d.area === 'Locales' || (nm && norm(d.titulo).includes(nm)));
  const notes = Array.isArray(l.notas) ? l.notas : [];
  const lastScore = aud.find((a) => a.puntuacion != null)?.puntuacion;
  const ultimaVisita = visitas[0]?.fecha || l.ultimaVisita || null;
  const isNotion = l.source?.system === 'notion';
  const pending = isNotion ? pendingFor(l) : null;
  const tabs = [['resumen', 'Resumen'], ['visitas', `Visitas · ${visitas.length}`], ['incidencias', `Incidencias · ${inc.length}`], ['auditorias', `Auditorías · ${aud.length}`], ['acciones', `Acciones · ${tareas.length}`], ['documentos', 'Documentos']];
  const li = (href, ic, color, title, sub, right = '') => `<div class="li" data-href="${href}"><span class="li-icon ${color}">${icon(ic, 'sm')}</span><div class="li-main"><div class="li-title">${title}</div><div class="li-sub">${sub}</div></div>${right}</div>`;
  const prop = (label, value, cls = '') => (value ? `<dt>${label}</dt><dd class="${cls}">${value}</dd>` : '');
  const panes = {
    resumen: `<div class="detail-grid"><div class="stack">
        ${pending ? `<div class="notice info">${icon('clock')}<div><b>Cambio pendiente de aprobación.</b> <a href="#/aprobaciones">Ver en Aprobaciones</a></div></div>` : ''}
        <div class="grid g3 keep2">
          <div class="card kpi"><div class="k-label">Incidencias abiertas</div><div class="k-value">${inc.filter((i) => !['Resuelta', 'Cerrada'].includes(i.estado)).length}</div></div>
          <div class="card kpi"><div class="k-label">Última auditoría</div><div class="k-value score ${scoreCls(lastScore)}">${lastScore ?? '—'}</div></div>
          <div class="card kpi"><div class="k-label">Última visita</div><div class="k-value" style="font-size:20px">${ultimaVisita ? relDay(ultimaVisita) : '—'}</div></div>
        </div>
        <div class="card"><div class="card-h"><h3>${isNotion ? 'Notas generales' : 'Información relevante'}</h3>${isNotion ? '<span class="xs subtle">Notion</span>' : ''}</div><div class="card-b"><p style="white-space:pre-wrap">${esc(l.notasGenerales || l.info || 'Sin información.')}</p></div></div>
        <div class="card"><div class="card-h"><h3>Notas de Alberto</h3><span class="xs subtle">Solo en este dispositivo</span></div><div class="card-b stack">
          ${notes.map((n) => `<div class="small"><span class="subtle">${fmtDate(n.at)} ·</span> ${esc(n.text)}</div>`).join('') || '<p class="small subtle">Sin notas todavía.</p>'}
          <form id="note-form" class="row"><input class="input" name="text" placeholder="Añadir nota" style="min-height:38px;font-size:15px"><button class="btn sm">Añadir</button></form>
        </div></div>
      </div>
      <div class="card pad"><dl class="props">
        <dt>Marca</dt><dd>${esc(l.marca || '—')}</dd>
        ${prop('Formato', esc(l.formato || ''))}
        ${prop('Código', esc(l.codigo || ''), 'mono')}
        <dt>Dirección</dt><dd>${esc(l.direccion || '—')}${m && !norm(l.direccion).includes(nm) ? `<br><span class="subtle">${esc(m)}</span>` : ''}</dd>
        ${prop('Zona', esc(l.zona || ''))}
        <dt>Cómo llegar</dt><dd>${navButtons(l)}</dd>
        <dt>Ubicación</dt><dd><a href="${googleMapsUrl(l)}" target="_blank" rel="noopener">${icon('pin', 'sm')} Abrir en Google Maps</a>${l.lat != null && l.lng != null ? `<br><a href="https://maps.apple.com/?q=${encodeURIComponent(`${l.lat},${l.lng}`)}" target="_blank" rel="noopener" class="small">Abrir en Apple Mapas</a>` : ''}</dd>
        <dt>Responsable asignado</dt><dd>${esc(resp(l) || '—')}</dd>
        ${prop('Gerente', esc(l.gerente || ''))}
        ${prop('Franquiciado / titular', esc(l.franquiciado || ''))}
        <dt>Estado</dt><dd>${estadoBadge(l)}</dd>
        ${prop('Prioridad', l.prioridad ? badge(l.prioridad) : '')}
        ${prop('Próxima visita', l.proximaVisita ? `${fmtDateFull(l.proximaVisita)}${isOverdue(l.proximaVisita, false) ? ' ' + badge('Vencida', 'red') : ''}` : '')}
        ${prop('Apertura', l.apertura ? fmtDateFull(l.apertura) : '')}
        <dt>Origen</dt><dd>${l.demo ? 'Ejemplo DEMO' : isNotion ? `Notion · Locales${l.url ? ` · <a href="${esc(l.url)}" target="_blank" rel="noopener">Abrir en Notion ${icon('external', 'sm')}</a>` : ''}` : 'App'}</dd>
        ${isNotion && l.source?.syncedAt ? `<dt>Sincronizado</dt><dd class="small subtle">${relDay(l.source.syncedAt)}</dd>` : ''}
      </dl>
      <div class="btn-row" style="margin-top:16px"><a class="btn primary sm" href="#/visitas/nueva/${l.id}">${icon('pin', 'sm')}Nueva visita</a><a class="btn sm" href="#/incidencias/nueva/${l.id}">${icon('alert', 'sm')}Incidencia</a><a class="btn sm" href="#/auditorias/nueva/${l.id}">${icon('audit', 'sm')}Auditoría</a>${isNotion ? `<button class="btn sm" data-propose>${icon('upload', 'sm')}Proponer cambio</button>` : ''}</div></div>
    </div>`,
    visitas: `<div class="card"><div class="list">${visitas.map((v) => li(`#/visitas/${v.id}`, 'pin', 'green', `${esc(v.motivo)} ${demoBadge(v)}`, `${fmtDateFull(v.fecha)} · ${esc(v.responsable)}`, badge(v.resultado))).join('') || empty('Sin visitas registradas', 'pin')}</div></div>`,
    incidencias: `<div class="card"><div class="list">${inc.map((i) => li(`#/incidencias/${i.id}`, 'alert', 'red', `<span class="mono">${esc(i.id)}</span> ${esc(i.titulo)} ${demoBadge(i)}`, `${esc(i.categoria)} · ${fmtDate(i.fecha)}`, badge(i.estado))).join('') || empty('Sin incidencias', 'alert')}</div></div>`,
    auditorias: `<div class="card"><div class="list">${aud.map((a) => li(`#/auditorias/${a.id}`, 'audit', 'purple', `${esc((a.categorias || []).join(', '))} ${demoBadge(a)}`, `${fmtDateFull(a.fecha)} · ${esc(a.auditor)}`, a.puntuacion != null ? `<span class="score ${scoreCls(a.puntuacion)}">${a.puntuacion}</span>` : badge(a.estado))).join('') || empty('Sin auditorías', 'audit')}</div></div>`,
    acciones: `<div class="card"><div class="list">${tareas.map((t) => li(`#/tareas/${t.id}`, 'checksq', 'teal', `${esc(t.titulo)} ${demoBadge(t)}`, `${esc(t.responsable)} · ${relDay(t.limite)}`, isOverdue(t.limite, false) ? badge('Vencida', 'red') : badge(t.prioridad))).join('') || empty('Sin acciones pendientes', 'checksq')}</div></div>`,
    documentos: `<div class="card"><div class="list">${docs.map((d) => li(`#/documentacion/${d.id}`, 'doc', 'blue', `${esc(d.titulo)} ${demoBadge(d)}`, `${esc(d.area)} · ${esc(d.origen)}`)).join('') || empty('Sin documentos vinculados', 'folder')}</div></div>
      <p class="xs subtle" style="margin-top:8px">La vinculación real de documentos por local llegará con el inventario de SharePoint y OneDrive.</p>`,
  };
  view.innerHTML = `
    <div style="margin:10px 0 4px"><a href="#/locales" class="small">${icon('left', 'sm')} Locales</a></div>
    <div class="page-head"><div class="titles"><div class="row wrap"><h1>${esc(l.nombre)}</h1>${demoBadge(l)}${estadoBadge(l)}</div><p>${[l.marca, l.codigo, [l.direccion, m && !norm(l.direccion).includes(nm) ? m : ''].filter(Boolean).join(', ')].filter(Boolean).map(esc).join(' · ')}</p></div></div>
    <div class="tabs">${tabs.map(([k, t]) => `<button data-tab="${k}" class="${st.tab === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div id="pane">${panes[st.tab] || panes.resumen}</div>`;
  if (!view._tb) { view._tb = 1; on(view, 'click', '[data-tab]', (e, b) => { st.tab = b.dataset.tab; detail(view, view._lid); }); on(view, 'click', '[data-propose]', () => { const cur = store.find('locales', view._lid); if (cur) proposeChange(cur, () => detail(view, view._lid)); }); }
  view._lid = id;
  view.querySelector('#note-form')?.addEventListener('submit', (e) => {
    e.preventDefault(); const text = e.target.text.value.trim(); if (!text) return;
    store.update('locales', id, { notas: [{ text, at: new Date().toISOString() }, ...notes] }); toast('Nota añadida'); detail(view, id);
  });
}

export default {
  id: 'locales', title: 'Locales', icon: 'store',
  render(view, params) { if (params[0]) { detail(view, params[0]); } else { st.tab = 'resumen'; list(view); } },
};
