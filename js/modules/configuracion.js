// Configuración (capa E): preferencias, estado real de las conexiones, proveedor de IA, datos e instalación.
import * as store from '../core/store.js';
import { icon, badge, pageHead, seg, bindSeg, field, openSheet, confirmSheet, toast, on } from '../core/ui.js';
import { esc, download } from '../core/utils.js';
import { LANGS } from '../core/i18n.js';
import { ADAPTERS, connectionStatus, notificationsAdapter } from '../adapters/index.js';
import { NOTION_DATABASES } from '../adapters/notion.js';
import { AI_PROVIDERS } from '../adapters/ai.js';
import { health } from '../adapters/backend.js';

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
        <p class="small subtle" style="margin-top:0">La app nunca guarda contraseñas ni tokens. Un backend seguro custodia los accesos a Notion, Microsoft 365 y la IA. Aquí solo se indica su dirección.</p>
        <div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap">
          <div class="field" style="flex:1;min-width:220px;margin:0"><label for="f-backend">Dirección del backend</label><input class="input" id="f-backend" type="url" inputmode="url" placeholder="https://api.ejemplo.com" value="${esc(s.backendUrl)}" data-backend></div>
          <button class="btn" data-savebackend>Guardar</button>
          <button class="btn" data-test>${icon('refresh', 'sm')}Probar</button>
        </div>
        <div class="list" style="margin-top:14px" data-adapters>${ADAPTERS.map((a) => `
          <div class="li" style="align-items:flex-start">
            <span class="li-icon">${icon({ notion: 'db', graph: 'globe', ai: 'sparkles', storage: 'folder', notifications: 'bell' }[a.id] || 'plug', 'sm')}</span>
            <div class="li-main"><div class="li-title">${esc(a.name)} <span class="xs subtle">· capa ${a.layer}</span></div>
              <div class="li-sub" style="white-space:normal">${esc(a.description)}</div>
              <div class="xs subtle" style="margin-top:4px;white-space:normal">Necesita: ${a.requires.map(esc).join(' · ')}</div></div>
            <span data-status="${ADAPTER_KEY[a.id]}">${badge('Comprobando…', '')}</span>
          </div>`).join('')}</div>
        <details style="margin-top:12px"><summary class="small" style="cursor:pointer">Bases de Notion previstas</summary>
          <div class="list" style="margin-top:8px">${Object.entries(NOTION_DATABASES).map(([k, d]) => `<div class="li"><div class="li-main"><div class="li-title">${esc(d.name)}</div><div class="li-sub mono">${d.databaseId ? esc(d.databaseId) : 'ID pendiente de recibir'}</div></div>${d.databaseId ? badge('ID recibido', 'green') : badge('Pendiente', 'amber')}</div>`).join('')}</div>
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
        <div class="row between" style="margin:14px 0;gap:12px"><div><div class="small"><b>Mostrar datos de ejemplo</b></div><div class="xs subtle">${demoCount} registros DEMO</div></div>
          <label class="switch"><input type="checkbox" data-showdemo ${s.showDemo ? 'checked' : ''} aria-label="Mostrar datos de ejemplo"><span></span></label></div>
        <div class="btn-row" style="flex-wrap:wrap">
          <button class="btn" data-export>${icon('download', 'sm')}Exportar copia</button>
          <label class="btn" style="cursor:pointer">${icon('upload', 'sm')}Importar copia<input type="file" accept="application/json,.json" hidden data-import></label>
          <button class="btn" data-reset>${icon('refresh', 'sm')}Restaurar ejemplos</button>
          <button class="btn" data-removedemo ${demoCount ? '' : 'disabled'}>Quitar ejemplos</button>
          <button class="btn danger" data-wipe>${icon('trash', 'sm')}Borrar todo</button>
        </div>`)}

      <p class="xs subtle" style="text-align:center;margin:20px 0 0">Restalia Operations AI · versión 0.1 (primera entrega)</p>`;

    const $ = (q) => view.querySelector(q);

    // Estado real de las conexiones (sin backend todo aparece «No conectado»).
    connectionStatus().then((st) => {
      if (!view.isConnected) return;
      Object.entries(ADAPTER_KEY).forEach(([, k]) => { const el = view.querySelector(`[data-status="${k}"]`); if (el) { const [t, c] = STATUS[st[k]] || STATUS.off; el.innerHTML = badge(t, c); } });
      $('[data-backendstate]').innerHTML = st.backend === 'off' ? 'Backend sin configurar' : st.backend === 'ok' ? '<span style="color:var(--green)">Backend accesible</span>' : '<span class="down">Backend no responde</span>';
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
      if (!store.getSettings().backendUrl) { toast('Primero guarda la dirección del backend', 'info'); return; }
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
