// Arranque, navegación y estructura (sidebar en escritorio, barra inferior en iPhone).
import * as store from './core/store.js';
import { icon, openSheet, toast, on, closeAllSheets } from './core/ui.js';
import { t, setLang } from './core/i18n.js';
import { isOverdue, relTime, esc } from './core/utils.js';
import * as sync from './core/sync.js';
import { backendConfigured } from './adapters/backend.js';

import inicio from './modules/inicio.js';
import asistente from './modules/asistente.js';
import agenda from './modules/agenda.js';
import tareas from './modules/tareas.js';
import locales from './modules/locales.js';
import visitas from './modules/visitas.js';
import auditorias from './modules/auditorias.js';
import incidencias from './modules/incidencias.js';
import proyectos from './modules/proyectos.js';
import documentacion from './modules/documentacion.js';
import comunicaciones from './modules/comunicaciones.js';
import informes from './modules/informes.js';
import automatizaciones, { runLocalAutomations } from './modules/automatizaciones.js';
import aprobaciones from './modules/aprobaciones.js';
import configuracion from './modules/configuracion.js';

const MODULES = [inicio, asistente, agenda, tareas, locales, visitas, auditorias, incidencias, proyectos, documentacion, comunicaciones, informes, automatizaciones, aprobaciones, configuracion];
const BY_ID = Object.fromEntries(MODULES.map((m) => [m.id, m]));
const GROUPS = [
  { label: null, ids: ['inicio', 'asistente'] },
  { label: 'nav.trabajo', ids: ['agenda', 'tareas', 'aprobaciones'] },
  { label: 'nav.operaciones', ids: ['locales', 'visitas', 'auditorias', 'incidencias', 'proyectos'] },
  { label: 'nav.informacion', ids: ['documentacion', 'comunicaciones', 'informes'] },
  { label: 'nav.sistema', ids: ['automatizaciones', 'configuracion'] },
];
const TABS = ['inicio', 'asistente', 'agenda', 'tareas'];

const $ = (s) => document.querySelector(s);
let current = null;

function counts() {
  return {
    tareas: store.all('tareas').filter((x) => !['Hecha', 'Cancelada'].includes(x.estado) && isOverdue(x.limite, false)).length,
    incidencias: store.all('incidencias').filter((x) => !['Resuelta', 'Cerrada'].includes(x.estado)).length,
    aprobaciones: store.all('aprobaciones').filter((x) => x.estado === 'Pendiente').length,
  };
}
const navLabel = (m) => t(`mod.${m.id}`, m.title);

function renderSidebar() {
  const c = counts();
  const s = store.getSettings();
  $('#sidebar').innerHTML = `
    <div class="brand"><div class="brand-logo">R</div><div><b>RESTALIA</b><span>Operations AI</span></div></div>
    <button class="btn primary sm" data-quick style="margin:0 6px 8px">${icon('plus', 'sm')}${t('quick.new', 'Registrar')}</button>
    ${GROUPS.map((g) => `
      ${g.label ? `<div class="nav-group">${t(g.label)}</div>` : ''}
      ${g.ids.map((id) => { const m = BY_ID[id]; const n = c[id];
        return `<button class="nav-item ${current === id ? 'active' : ''}" data-nav="${id}">${icon(m.icon)}<span>${navLabel(m)}</span>${n ? `<span class="count">${n}</span>` : ''}</button>`; }).join('')}
    `).join('')}
    <div class="sidebar-foot">
      <div class="user-chip"><span class="avatar">${(s.userName || 'A')[0]}</span><div class="grow"><div class="small" style="font-weight:600">${s.userName}</div><div class="xs subtle">${s.company} · ${backendConfigured() ? (sync.state.auth?.authenticated ? 'Conectado' : 'Sin sesión') : t('common.local', 'Modo local')}</div></div>
      <button class="btn ghost icon sm" data-theme-toggle aria-label="Cambiar tema">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', 'sm')}</button></div>
    </div>`;
}

function renderTabbar() {
  const more = !TABS.includes(current);
  $('#tabbar').innerHTML = TABS.map((id) => { const m = BY_ID[id];
    return `<button class="${current === id ? 'active' : ''}" data-nav="${id}" aria-label="${navLabel(m)}">${icon(m.icon)}<span>${id === 'asistente' ? t('tab.asistente', 'Asistente') : navLabel(m)}</span></button>`; }).join('')
    + `<button class="${more ? 'active' : ''}" data-more aria-label="Más módulos">${icon('grid')}<span>${t('tab.more', 'Más')}</span></button>`;
}

function renderTopbar(m) {
  const n = counts().aprobaciones;
  $('#topbar').innerHTML = `
    <div class="crumb"><span class="d-only">${icon(m.icon, 'sm')}</span><b>${navLabel(m)}</b></div>
    <div class="spacer"></div>
    ${backendConfigured() ? (() => { const st = sync.syncStatus(); return `<button class="sync-chip k-${st.kind}" data-syncchip title="${esc(st.title)}" aria-label="Estado de la sincronización: ${esc(st.text)}. ${esc(st.title)}"><i></i><span>${esc(st.text)}</span></button>`; })() : ''}
    ${backendConfigured() ? `<button class="btn ghost icon" data-synctop aria-label="Actualizar ahora" title="${sync.state.busy ? 'Actualizando…' : `Actualizar ahora${store.getSettings().lastSync ? ' · última: ' + relTime(store.getSettings().lastSync) : ''}${sync.state.error ? ' · ' + sync.state.error : ''}`}" ${sync.state.busy ? 'disabled' : ''} style="${sync.state.error ? 'color:var(--red)' : ''}">${icon('refresh')}</button>` : ''}
    <button class="btn ghost icon" data-nav="aprobaciones" aria-label="Aprobaciones pendientes" style="position:relative">${icon('bell')}${n ? `<span style="position:absolute;top:6px;right:6px;width:8px;height:8px;border-radius:50%;background:var(--red)"></span>` : ''}</button>
    <button class="btn primary sm m-only" data-quick aria-label="Registrar">${icon('plus', 'sm')}</button>`;
}

function parseHash() {
  const parts = (location.hash.split('?')[0].replace(/^#\/?/, '') || 'inicio').split('/').filter(Boolean).map(decodeURIComponent);
  return { id: BY_ID[parts[0]] ? parts[0] : 'inicio', params: parts.slice(1) };
}

function route() {
  const { id, params } = parseHash();
  closeAllSheets();
  const m = BY_ID[id];
  const changed = current !== id;
  current = id;
  document.title = `${navLabel(m)} · Restalia Ops`;
  renderSidebar(); renderTabbar(); renderTopbar(m);
  $('#fab').classList.toggle('hide', id === 'asistente');
  const view = $('#view');
  const fresh = view.cloneNode(false); // elimina listeners del módulo anterior
  view.replaceWith(fresh);
  fresh.className = 'view' + (changed ? ' enter' : '');
  try { m.render(fresh, params); } catch (e) {
    console.error(e);
    fresh.innerHTML = `<div class="notice" style="margin-top:20px">${icon('alert')}<div><b>No se ha podido abrir ${navLabel(m)}.</b><br>${String(e.message || e)}</div></div>`;
  }
  if (changed) window.scrollTo({ top: 0 });
}
export const rerender = () => route();

function openMore() {
  const close = openSheet({
    title: 'Todos los módulos',
    body: `<div class="grid keep2 g3" style="gap:10px">${MODULES.filter((m) => !TABS.includes(m.id)).map((m) =>
      `<button class="card click" data-go="${m.id}" style="padding:14px;display:flex;flex-direction:column;gap:8px;align-items:flex-start;text-align:left;border:1px solid var(--border);background:var(--surface);color:var(--text)">${icon(m.icon, 'lg')}<span style="font-weight:560;font-size:14px">${navLabel(m)}</span></button>`).join('')}</div>`,
    onMount: (el) => on(el, 'click', '[data-go]', (e, b) => { location.hash = `#/${b.dataset.go}`; close(); }),
  });
}

function openQuick() {
  const items = [
    ['visitas/nueva', 'pin', 'Visita', 'Registra una visita a un local'],
    ['incidencias/nueva', 'alert', 'Incidencia', 'Abre una incidencia con fotos'],
    ['tareas/nueva', 'checksq', 'Tarea', 'Crea una tarea o acción'],
    ['auditorias/nueva', 'audit', 'Auditoría', 'Empieza un checklist'],
    ['agenda/nuevo', 'calendar', 'Evento', 'Añade algo a tu agenda'],
  ];
  const close = openSheet({
    title: 'Registrar',
    body: `<div class="list" style="margin:-8px -6px">${items.map(([h, ic, tt, sub]) => `<div class="li" data-go="${h}" style="border-radius:10px;border:0"><span class="li-icon blue">${icon(ic)}</span><div class="li-main"><div class="li-title">${tt}</div><div class="li-sub">${sub}</div></div>${icon('right', 'sm')}</div>`).join('')}</div>`,
    onMount: (el) => on(el, 'click', '[data-go]', (e, b) => { close(); setTimeout(() => { location.hash = `#/${b.dataset.go}`; }, 50); }),
  });
}

export function applyTheme() {
  const pref = store.getSettings().theme;
  const dark = pref === 'dark' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#meta-theme').setAttribute('content', dark ? '#0a0c10' : '#f5f6f8');
  $('#meta-status').setAttribute('content', dark ? 'black-translucent' : 'default');
}

function bindShell() {
  const app = document.getElementById('app');
  on(app, 'click', '[data-nav]', (e, el) => { location.hash = `#/${el.dataset.nav}`; });
  on(app, 'click', '[data-more]', openMore);
  on(app, 'click', '[data-quick]', openQuick);
  on(app, 'click', '[data-syncchip]', () => {
    const st = sync.syncStatus();
    if (st.kind === 'auth') { location.hash = '#/configuracion'; return; }
    toast(st.title, { ok: 'check', busy: 'refresh', offline: 'wifi', error: 'alert', warn: 'alert' }[st.kind] || 'info');
  });
  on(app, 'click', '[data-synctop]', async () => {
    if (!sync.state.auth?.authenticated) { location.hash = '#/configuracion'; toast('Inicia sesión para sincronizar', 'lock'); return; }
    try { const r = await sync.syncNow(); toast(`Actualizado · ${r?.changes || 0} cambios`, 'check'); } catch (e) { toast(e.message, 'alert'); }
  });
  sync.onSync(() => { if (BY_ID[current]) renderTopbar(BY_ID[current]); renderSidebar(); });
  on(app, 'click', '[data-theme-toggle]', () => {
    store.setSettings({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' });
    applyTheme(); renderSidebar();
  });
  // Tarjetas y filas con data-href navegan (delegado global)
  on(app, 'click', '[data-href]', (e, el) => {
    const ctl = e.target.closest('button,a,input,select,label,textarea');
    if (ctl && ctl !== el && el.contains(ctl)) return;
    location.hash = el.dataset.href;
  });
  $('#fab').innerHTML = icon('sparkles');
  $('#fab').addEventListener('click', () => { location.hash = '#/asistente'; });
  window.addEventListener('hashchange', route);
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  window.addEventListener('scroll', () => $('#topbar').classList.toggle('scrolled', scrollY > 4), { passive: true });
  // Cambios de datos: refrescar contadores de navegación sin repintar la vista
  store.subscribe((col) => { if (col === 'settings') { setLang(store.getSettings().lang); applyTheme(); return route(); } if (col === '*') return route(); renderSidebar(); renderTabbar(); if (BY_ID[current]) renderTopbar(BY_ID[current]); });
}

function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Hay una versión nueva. Cierra y vuelve a abrir la app.', 'refresh'); });
    });
  }).catch((e) => console.warn('SW', e));
}

store.init();
setLang(store.getSettings().lang);
applyTheme();
bindShell();
try { runLocalAutomations(); } catch (e) { console.warn('Automatizaciones', e); }
route();
registerSW();
sync.startAutoSync().catch((e) => console.warn('Sincronización', e));
