// Módulo escrito por GPT-6.1 Terra (OpenWork) y revisado.
import { esc, debounce, matches, fmtDate, fmtDateFull } from '../core/utils.js';
import { icon, demoBadge, empty, pageHead, demoNotice, openSheet, toast, on } from '../core/ui.js';
import * as store from '../core/store.js';

const areas = ['Operaciones', 'Formación', 'Marketing', 'Comunicación', 'RRHH', 'Compras', 'Calidad', 'PRL', 'Aperturas', 'Locales'];
const tipos = ['PDF', 'Word', 'Excel', 'PowerPoint', 'Enlace'];
const colores = { PDF: 'red', Word: 'blue', Excel: 'green', PowerPoint: 'amber', Enlace: 'purple' };
const filtros = { consulta: '', area: '', tipo: '', dias: '' };

function urlSegura(url) {
  if (!url) return '';
  try { const p = new URL(url, location.href); return ['http:', 'https:'].includes(p.protocol) ? p.href : ''; } catch { return ''; }
}

function mostrarDetalle(doc) {
  const url = urlSegura(doc.url);
  openSheet({
    title: doc.titulo,
    body: `
      <div class="row wrap" style="margin-bottom:12px">${demoBadge(doc)}<span class="badge">${esc(doc.tipo)}</span><span class="badge blue">${esc(doc.origen)}</span></div>
      <dl class="props">
        <dt>Área</dt><dd>${esc(doc.area || 'Sin especificar')}</dd>
        <dt>Tipo</dt><dd>${esc(doc.tipo || 'Sin especificar')}</dd>
        <dt>Origen</dt><dd>${esc(doc.origen || 'Sin especificar')}</dd>
        <dt>Ubicación</dt><dd class="mono">${esc(doc.ubicacion || 'Sin especificar')}</dd>
        <dt>Fecha</dt><dd>${doc.fecha ? esc(fmtDateFull(doc.fecha)) : 'Sin especificar'}</dd>
      </dl>
      <h3 style="margin-top:18px">Resumen</h3>
      <p style="margin-top:6px">${esc(doc.resumen || 'Sin resumen disponible.')}</p>
      ${!url ? '<p id="original-no-disponible" class="xs subtle" style="margin-top:14px">Abrir el original estará disponible al conectar Microsoft 365.</p>' : ''}`,
    footer: `
      <button class="btn" type="button" data-copiar ${doc.ubicacion ? '' : 'disabled'}>${icon('clip', 'sm')}Copiar ubicación</button>
      ${url ? `<a class="btn primary" href="${esc(url)}" target="_blank" rel="noopener">${icon('external', 'sm')}Abrir original</a>`
        : `<button class="btn primary" type="button" disabled aria-describedby="original-no-disponible">${icon('external', 'sm')}Abrir original</button>`}`,
    onMount(sheetEl) {
      sheetEl.querySelector('[data-copiar]')?.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(doc.ubicacion); toast('Ubicación copiada'); } catch { toast('No se pudo copiar', 'alert'); }
      });
    },
  });
}

function render(view, params = []) {
  const documentos = store.all('documentos') || [];
  view.innerHTML = `
    ${pageHead('Documentación', 'Buscador de manuales, procedimientos y documentos de SharePoint y OneDrive.', '')}
    ${store.all('documentos').some((r) => r.demo) ? demoNotice('<b>Documentos de ejemplo.</b> Los reales llegarán con el inventario de SharePoint y OneDrive. La app solo enlaza: nunca mueve, modifica ni borra archivos.') : ''}
    <div class="stack" style="margin-top:14px">
      <div class="toolbar" style="margin:0">
        <div class="search">${icon('search', 'sm')}<input type="search" aria-label="Buscar documentos" placeholder="Buscar por título, resumen o ubicación" value="${esc(filtros.consulta)}"></div>
        <select class="sel" data-tipo aria-label="Filtrar por tipo"><option value="">Todos los tipos</option>
          ${tipos.map((t) => `<option value="${esc(t)}"${filtros.tipo === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
        <select class="sel" data-fecha aria-label="Filtrar por fecha">
          ${[['', 'Cualquier fecha'], ['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días']].map(([v, l]) => `<option value="${v}"${filtros.dias === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <span class="xs subtle" data-resultados aria-live="polite" style="margin-left:auto"></span>
      </div>
      <div class="chips" aria-label="Filtrar por área">
        ${['', ...areas].map((area) => {
          const total = area ? documentos.filter((d) => d.area === area).length : documentos.length;
          return `<button type="button" class="chip${filtros.area === area ? ' on' : ''}" data-area="${esc(area)}" aria-pressed="${filtros.area === area}">${esc(area || 'Todas')} <span class="subtle">${total}</span></button>`;
        }).join('')}
      </div>
      <div class="card"><div class="list" data-lista></div></div>
    </div>`;

  function pintarLista() {
    const ahora = Date.now();
    const limite = filtros.dias ? ahora - Number(filtros.dias) * 864e5 : 0;
    const res = documentos.filter((d) => {
      if (filtros.consulta && !matches(d, filtros.consulta, ['titulo', 'resumen', 'ubicacion'])) return false;
      if (filtros.area && d.area !== filtros.area) return false;
      if (filtros.tipo && d.tipo !== filtros.tipo) return false;
      if (filtros.dias) { const f = new Date(d.fecha).getTime(); if (!d.fecha || !Number.isFinite(f) || f < limite || f > ahora) return false; }
      return true;
    }).sort((a, b) => (new Date(b.fecha).getTime() || 0) - (new Date(a.fecha).getTime() || 0));
    view.querySelector('[data-resultados]').textContent = `${res.length} ${res.length === 1 ? 'resultado' : 'resultados'}`;
    view.querySelector('[data-lista]').innerHTML = res.length
      ? res.map((d) => `
          <button type="button" class="li" data-doc="${esc(d.id)}" style="width:100%;text-align:left;border:0;border-bottom:1px solid var(--border);background:none;color:inherit;font:inherit">
            <span class="li-icon ${colores[d.tipo] || ''}">${icon('doc')}</span>
            <span class="li-main"><span class="li-title" style="display:block">${esc(d.titulo)} ${demoBadge(d)}</span>
            <span class="li-sub" style="display:block">${esc(d.area || 'Sin área')} · ${esc(d.origen || 'Sin origen')} · ${d.fecha ? esc(fmtDate(d.fecha)) : 'Sin fecha'}</span></span>
            ${icon('right', 'sm')}
          </button>`).join('')
      : empty('No hay documentos que coincidan con los filtros.', 'doc');
  }

  const buscar = debounce(pintarLista, 200);
  view.querySelector('input[type="search"]').addEventListener('input', (e) => { filtros.consulta = e.target.value; buscar(); });
  view.querySelector('[data-tipo]').addEventListener('change', (e) => { filtros.tipo = e.target.value; pintarLista(); });
  view.querySelector('[data-fecha]').addEventListener('change', (e) => { filtros.dias = e.target.value; pintarLista(); });
  on(view, 'click', '[data-area], [data-doc]', (e, el) => {
    if (el.hasAttribute('data-area')) {
      filtros.area = el.dataset.area;
      view.querySelectorAll('[data-area]').forEach((c) => { const a = c.dataset.area === filtros.area; c.classList.toggle('on', a); c.setAttribute('aria-pressed', String(a)); });
      pintarLista(); return;
    }
    const doc = store.find('documentos', el.dataset.doc);
    if (doc) mostrarDetalle(doc); else toast('No se encontró el documento', 'alert');
  });
  pintarLista();
  if (params[0]) { const doc = store.find('documentos', params[0]); if (doc) mostrarDetalle(doc); else toast('No se encontró el documento', 'alert'); }
}

export default { id: 'documentacion', title: 'Documentación', icon: 'folder', render };
