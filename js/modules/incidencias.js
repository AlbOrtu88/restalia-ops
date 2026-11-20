import * as store from '../core/store.js';
import { icon, badge, demoBadge, sourceBadge, empty, pageHead, seg, bindSeg, field, readForm, openSheet, toast, on, compressImage, avatar } from '../core/ui.js';
import { esc, matches, groupBy, fmtDate, fmtDateFull, fmtDateTime, relDay, isOverdue, isoDate, addDays, toDate, debounce } from '../core/utils.js';
import { putMedia, hydrateMedia } from '../core/media.js';
import { openTaskForm } from './tareas.js';
import { proposeToNotion, incidenciaDatos } from './visitas.js';

export const ESTADOS = ['Nueva', 'En curso', 'Pendiente', 'Resuelta', 'Cerrada'];
const CATS = ['Mantenimiento', 'Seguridad alimentaria', 'Personal', 'Proveedor', 'Cliente', 'Sistemas', 'Limpieza'];
const PRIOS = ['Crítica', 'Alta', 'Media', 'Baja'];
const SEVERIDADES = ['Crítica', 'Alta', 'Media', 'Baja'];
const st = { view: 'kanban', q: '', prio: '', cat: '', closed: false };

function openForm(localId = '') {
  const photos = [];
  openSheet({
    title: 'Nueva incidencia',
    body: `<form class="form" id="i-form">
      ${field({ label: 'Título', name: 'titulo', required: true, placeholder: 'Qué ocurre, en pocas palabras' })}
      ${field({ label: 'Local', name: 'localId', required: true, value: localId, options: [{ value: '', label: 'Elige un local' }, ...store.all('locales').map((l) => ({ value: l.id, label: l.nombre }))] })}
      <div class="form-row">${field({ label: 'Categoría', name: 'categoria', options: CATS })}${field({ label: 'Prioridad', name: 'prioridad', options: PRIOS, value: 'Media' })}</div>
      <div class="form-row">${field({ label: 'Severidad', name: 'severidad', options: SEVERIDADES, value: 'Media' })}${field({ label: 'Fecha objetivo', name: 'fechaObjetivo', type: 'date', hint: 'Cuándo debería estar resuelta' })}</div>
      ${field({ label: 'Descripción', name: 'descripcion', type: 'textarea' })}
      <div class="field"><label>Evidencias</label><div class="photos" id="i-photos"><label class="photo-add" aria-label="Añadir foto">${icon('camera')}<input type="file" accept="image/*" capture="environment" multiple hidden id="i-file"></label></div></div>
      <div class="form-row">${field({ label: 'Responsable', name: 'responsable', value: 'Alberto' })}${field({ label: 'Fecha límite', name: 'limite', type: 'date', value: isoDate(addDays(new Date(), 3)) })}</div>
      ${field({ label: 'Acción correctiva', name: 'accion', placeholder: 'Qué se va a hacer' })}
      ${field({ label: 'Causa raíz', name: 'causaRaiz', placeholder: 'Por qué ha pasado (si se sabe)' })}
      ${field({ label: 'Siguiente paso', name: 'siguientePaso', placeholder: 'Lo próximo que hay que hacer' })}
    </form>`,
    footer: '<button class="btn" data-close>Cancelar</button><button class="btn primary" data-save>Abrir incidencia</button>',
    onMount(el, close) {
      const f = el.querySelector('#i-form');
      el.querySelector('#i-file').addEventListener('change', async (e) => {
        for (const file of e.target.files) { try { const url = await compressImage(file); const id = await putMedia(url, { kind: 'incidencia' }); if (id) { photos.push(id); el.querySelector('#i-photos').insertAdjacentHTML('afterbegin', `<img class="photo" src="${url}" alt="Evidencia">`); } } catch { toast('No se pudo leer la imagen', 'alert'); } }
        e.target.value = '';
      });
      el.querySelector('[data-save]').addEventListener('click', () => {
        if (!f.reportValidity()) return;
        const v = readForm(f);
        const rec = store.add('incidencias', { ...v, id: store.nextIncidentId(), estado: 'Nueva', fecha: new Date().toISOString(), limite: v.limite ? new Date(v.limite + 'T18:00').toISOString() : null, seguimiento: [], evidencias: photos });
        store.log(`Se abrió la incidencia ${rec.id} en ${store.localName(v.localId)}`, 'incidencias');
        // Local real de Notion: la incidencia se propone a Notion automáticamente (se crea al aprobarla).
        const prop = store.find('locales', v.localId)?.source?.system === 'notion' ? proposeToNotion('incidencia', rec, incidenciaDatos(rec)) : null;
        close(); toast(`Incidencia ${rec.id} abierta${prop ? (store.getSettings().notionDirecto !== false ? ' · enviando a Notion…' : ' · enviada a Aprobaciones para Notion') : ''}`); location.hash = `#/incidencias/${rec.id}`;
      });
    },
  });
}

function filtered() {
  return store.all('incidencias').filter((i) => (st.closed || i.estado !== 'Cerrada') && (!st.prio || i.prioridad === st.prio) && (!st.cat || i.categoria === st.cat)
    && matches({ ...i, local: store.localName(i.localId) }, st.q, ['id', 'titulo', 'descripcion', 'local', 'responsable', 'categoria'])).sort((a, b) => toDate(b.fecha) - toDate(a.fecha));
}
const prioBar = (p) => `var(--${{ 'Crítica': 'red', 'Alta': 'amber', 'Media': 'accent', 'Baja': 'border-strong' }[p]})`;

function kanban(items) {
  const by = groupBy(items, 'estado');
  return `<div class="kanban">${ESTADOS.filter((e) => st.closed || e !== 'Cerrada').map((e) => `<div class="kcol" data-col="${e}"><div class="kcol-h">${badge(e)}<span class="n">${(by[e] || []).length}</span></div>
    ${(by[e] || []).map((i) => `<div class="kcard" draggable="true" data-inc="${i.id}" style="box-shadow:inset 3px 0 0 ${prioBar(i.prioridad)}">
      <div class="row between"><span class="mono subtle">${i.id}</span>${demoBadge(i)}</div>
      <div class="kt">${esc(i.titulo)}</div>
      <div class="km">${badge(i.prioridad)}<span>${esc(store.localName(i.localId).replace('DEMO · ', ''))}</span></div>
      <div class="km" style="margin-top:6px">${avatar(i.responsable)}<span style="${isOverdue(i.limite, ['Resuelta', 'Cerrada'].includes(i.estado)) ? 'color:var(--red);font-weight:600' : ''}">${i.limite ? 'Límite ' + relDay(i.limite).toLowerCase() : ''}</span></div>
      <select class="sel m-only" data-move="${i.id}" style="margin-top:8px;height:32px;width:100%" aria-label="Mover a">${ESTADOS.map((x) => `<option ${x === i.estado ? 'selected' : ''}>${x}</option>`).join('')}</select>
    </div>`).join('')}</div>`).join('')}</div>`;
}
function table(items) {
  return `<div class="card table-wrap"><table class="tbl mobile-list"><thead><tr><th>ID</th><th>Incidencia</th><th>Local</th><th>Categoría</th><th>Prioridad</th><th>Estado</th><th>Responsable</th><th>Límite</th></tr></thead><tbody>
    ${items.map((i) => `<tr data-href="#/incidencias/${i.id}"><td class="mono">${i.id}</td><td class="primary">${esc(i.titulo)} ${demoBadge(i)}</td><td>${esc(store.localName(i.localId))}</td><td class="hide-m">${esc(i.categoria)}</td><td>${badge(i.prioridad)}</td><td>${badge(i.estado)}</td><td class="hide-m">${esc(i.responsable)}</td><td style="${isOverdue(i.limite, ['Resuelta', 'Cerrada'].includes(i.estado)) ? 'color:var(--red)' : ''}">${i.limite ? fmtDate(i.limite) : '—'}</td></tr>`).join('')}
  </tbody></table>${items.length ? '' : empty('Sin incidencias con estos filtros', 'alert')}</div>`;
}

function list(view) {
  const paint = () => { const items = filtered(); view.querySelector('#i-body').innerHTML = st.view === 'kanban' ? kanban(items) : table(items); view.querySelector('#i-count').textContent = `${items.length} incidencias`; };
  view.innerHTML = `
    ${pageHead('Incidencias', 'Del aviso al cierre, con responsables, plazos y evidencias.', `${seg('iview', [{ value: 'kanban', label: 'Kanban', icon: 'kanban' }, { value: 'lista', label: 'Lista', icon: 'list' }], st.view)}<button class="btn primary" data-new>${icon('plus', 'sm')}Nueva incidencia</button>`)}
    <div class="toolbar">
      <div class="search">${icon('search', 'sm')}<input id="i-q" type="search" placeholder="Buscar por ID, local, texto…" value="${esc(st.q)}"></div>
      <select class="sel" id="i-prio" aria-label="Prioridad"><option value="">Todas las prioridades</option>${PRIOS.map((p) => `<option ${p === st.prio ? 'selected' : ''}>${p}</option>`).join('')}</select>
      <select class="sel" id="i-cat" aria-label="Categoría"><option value="">Todas las categorías</option>${CATS.map((p) => `<option ${p === st.cat ? 'selected' : ''}>${p}</option>`).join('')}</select>
      <button class="chip ${st.closed ? 'on' : ''}" data-closed>Ver cerradas</button>
      <span class="xs subtle" id="i-count" style="margin-left:auto"></span>
    </div><div id="i-body"></div>`;
  paint();
  bindSeg(view, 'iview', (v) => { st.view = v; view.querySelectorAll('[data-seg="iview"] button').forEach((b) => b.classList.toggle('on', b.dataset.val === v)); paint(); });
  view.querySelector('#i-q').addEventListener('input', debounce((e) => { st.q = e.target.value; paint(); }, 150));
  view.querySelector('#i-prio').addEventListener('change', (e) => { st.prio = e.target.value; paint(); });
  view.querySelector('#i-cat').addEventListener('change', (e) => { st.cat = e.target.value; paint(); });
  on(view, 'click', '[data-closed]', (e, b) => { st.closed = !st.closed; b.classList.toggle('on'); paint(); });
  on(view, 'click', '[data-new]', () => openForm());
  on(view, 'click', '[data-inc]', (e, el) => { if (!e.target.closest('select')) location.hash = `#/incidencias/${el.dataset.inc}`; });
  on(view, 'change', '[data-move]', (e, s) => { setState(s.dataset.move, s.value); paint(); });
  let drag = null;
  view.addEventListener('dragstart', (e) => { const c = e.target.closest('.kcard'); if (c) { drag = c.dataset.inc; c.classList.add('dragging'); } });
  view.addEventListener('dragover', (e) => { const c = e.target.closest('.kcol'); if (c) { e.preventDefault(); c.classList.add('over'); } });
  view.addEventListener('dragleave', (e) => e.target.closest?.('.kcol')?.classList.remove('over'));
  view.addEventListener('drop', (e) => { const c = e.target.closest('.kcol'); if (c && drag) { e.preventDefault(); setState(drag, c.dataset.col); drag = null; paint(); } });
}

function setState(id, estado) {
  const i = store.find('incidencias', id);
  if (!i || i.estado === estado) return;
  store.update('incidencias', id, { estado, seguimiento: [...(i.seguimiento || []), { fecha: new Date().toISOString(), texto: `Estado: ${i.estado} → ${estado}` }] });
  store.log(`${id} pasó a ${estado}`, 'incidencias');
  toast(`${id} · ${estado}`);
}

function detail(view, id) {
  const i = store.find('incidencias', id);
  if (!i) { view.innerHTML = `<div class="card" style="margin-top:20px">${empty('Incidencia no encontrada', 'alert')}</div>`; return; }
  const tasks = store.all('tareas').filter((t) => t.origenRef === id);
  const proposed = store.all('aprobaciones').some((a) => a.ref?.id === id && !['Rechazada', 'Error'].includes(a.estado));
  const canPropose = !i.demo && i.source?.system !== 'notion';
  const idx = ESTADOS.indexOf(i.estado);
  view.innerHTML = `
    <div style="margin:10px 0 4px"><a href="#/incidencias" class="small">${icon('left', 'sm')} Incidencias</a></div>
    <div class="page-head"><div class="titles"><p class="mono subtle">${i.id}</p><div class="row wrap"><h1>${esc(i.titulo)}</h1>${demoBadge(i)}${sourceBadge(i)}</div><p><a href="#/locales/${i.localId}">${esc(store.localName(i.localId))}</a> · ${esc(i.categoria)} · abierta ${relDay(i.fecha).toLowerCase()}</p></div>
      <div class="btn-row">${i.notionUrl ? `<a class="btn sm" href="${esc(i.notionUrl)}" target="_blank" rel="noopener">${icon('db', 'sm')}Ver en Notion</a>` : canPropose ? `<button class="btn sm" data-notion ${proposed ? 'disabled' : ''}>${icon('upload', 'sm')}${proposed ? 'Propuesta a Notion' : 'Proponer a Notion'}</button>` : ''}</div></div>
    <div class="card pad" style="margin-bottom:14px"><div class="h4 small subtle" style="margin-bottom:10px">Estado</div>
      <div class="seg" style="width:100%;overflow-x:auto">${ESTADOS.map((e, n) => `<button data-state="${e}" class="${e === i.estado ? 'on' : ''}" style="flex:1;${n < idx ? 'color:var(--green)' : ''}">${n < idx ? icon('check', 'sm') : ''}${e}</button>`).join('')}</div></div>
    <div class="detail-grid"><div class="stack">
      <div class="card pad"><h3>Descripción</h3><p style="margin-top:8px;white-space:pre-wrap">${esc(i.descripcion || '—')}</p>
        <h3 style="margin-top:18px">Acción correctiva</h3><p style="margin-top:8px">${esc(i.accion || 'Sin definir')}</p>
        <div class="row between" style="margin-top:18px"><h3>Análisis</h3>${!i.demo ? `<button class="btn sm" data-analisis>${icon('edit', 'sm')}Editar</button>` : ''}</div>
        <dl class="props" style="margin-top:8px"><dt>Causa raíz</dt><dd>${esc(i.causaRaiz || 'Sin analizar')}</dd><dt>Siguiente paso</dt><dd>${esc(i.siguientePaso || '—')}</dd></dl>
        ${(i.evidencias || []).length ? `<h3 style="margin-top:18px">Evidencias</h3><div class="photos" style="margin-top:8px">${i.evidencias.map((m) => `<img class="photo" data-media="${m}" alt="Evidencia" style="width:110px;height:110px">`).join('')}</div>` : ''}</div>
      <div class="card"><div class="card-h"><h3>Tareas derivadas</h3><button class="btn sm" data-task>${icon('plus', 'sm')}Tarea</button></div><div class="list">
        ${tasks.map((t) => `<div class="li" data-href="#/tareas/${t.id}"><span class="li-icon teal">${icon('checksq', 'sm')}</span><div class="li-main"><div class="li-title">${esc(t.titulo)}</div><div class="li-sub">${esc(t.responsable)} · ${relDay(t.limite)}</div></div>${badge(t.estado)}</div>`).join('') || empty('Sin tareas derivadas', 'checksq')}</div></div>
      <div class="card"><div class="card-h"><h3>Seguimiento</h3></div><div class="card-b">
        <div class="timeline">${(i.seguimiento || []).slice().reverse().map((s) => `<div class="tl-item"><span class="tl-dot"></span><div><div class="small">${esc(s.texto)}</div><div class="xs subtle">${fmtDateTime(s.fecha)}</div></div></div>`).join('') || '<p class="small subtle">Sin anotaciones.</p>'}</div>
        <form id="seg-form" class="row" style="margin-top:12px"><input class="input" name="texto" placeholder="Añadir anotación" style="min-height:38px;font-size:15px"><button class="btn sm">Añadir</button></form>
      </div></div>
    </div>
    <div class="card pad"><dl class="props">
      <dt>Prioridad</dt><dd>${badge(i.prioridad)}</dd>${i.severidad ? `<dt>Severidad</dt><dd>${badge(i.severidad)}</dd>` : ''}<dt>Estado</dt><dd>${badge(i.estado)}</dd>
      <dt>Responsable</dt><dd>${esc(i.responsable)}</dd><dt>Fecha</dt><dd>${fmtDateFull(i.fecha)}</dd>
      <dt>Fecha límite</dt><dd style="${isOverdue(i.limite, ['Resuelta', 'Cerrada'].includes(i.estado)) ? 'color:var(--red);font-weight:600' : ''}">${i.limite ? `${fmtDateFull(i.limite)} (${relDay(i.limite)})` : '—'}</dd>
      ${i.fechaObjetivo ? `<dt>Fecha objetivo</dt><dd style="${isOverdue(i.fechaObjetivo, ['Resuelta', 'Cerrada'].includes(i.estado)) ? 'color:var(--red);font-weight:600' : ''}">${fmtDateFull(i.fechaObjetivo)} (${relDay(i.fechaObjetivo)})</dd>` : ''}
      <dt>Local</dt><dd><a href="#/locales/${i.localId}">${esc(store.localName(i.localId))}</a></dd>
      <dt>Origen</dt><dd>${i.demo ? 'Ejemplo DEMO' : i.source?.system === 'local' ? 'Este dispositivo' : 'Notion'}</dd>
    </dl></div></div>`;
  hydrateMedia(view);
  view.querySelector('#seg-form').addEventListener('submit', (e) => {
    e.preventDefault(); const texto = e.target.texto.value.trim(); if (!texto) return;
    store.update('incidencias', id, { seguimiento: [...(i.seguimiento || []), { fecha: new Date().toISOString(), texto }] }); detail(view, id);
  });
  if (view._db) return; view._db = 1;
  on(view, 'click', '[data-state]', (e, b) => { setState(id, b.dataset.state); detail(view, id); });
  on(view, 'click', '[data-task]', () => { const x = store.find('incidencias', id); openTaskForm({ titulo: x.accion || `Resolver ${id}`, localId: x.localId, prioridad: x.prioridad === 'Crítica' ? 'Crítica' : 'Alta', origenRef: id }, { onSaved: () => detail(view, id) }); });
  on(view, 'click', '[data-notion]', () => { const x = store.find('incidencias', id); toast(proposeToNotion('incidencia', x, incidenciaDatos(x)) ? 'Propuesta enviada a Aprobaciones' : 'Ya hay una propuesta para esta incidencia', 'upload'); detail(view, id); });
  on(view, 'click', '[data-analisis]', () => editAnalisis(id, () => detail(view, id)));
}

// Severidad, fecha objetivo, causa raíz y siguiente paso. En una incidencia de Notion el cambio va a Aprobaciones (store.update).
function editAnalisis(id, done) {
  const x = store.find('incidencias', id);
  openSheet({
    title: 'Análisis de la incidencia',
    body: `<form class="form" id="an-form">
      <div class="form-row">${field({ label: 'Severidad', name: 'severidad', options: [{ value: '', label: 'Sin indicar' }, ...SEVERIDADES], value: x.severidad || '' })}${field({ label: 'Fecha objetivo', name: 'fechaObjetivo', type: 'date', value: x.fechaObjetivo ? String(x.fechaObjetivo).slice(0, 10) : '' })}</div>
      ${field({ label: 'Causa raíz', name: 'causaRaiz', type: 'textarea', rows: 3, value: x.causaRaiz || '' })}
      ${field({ label: 'Siguiente paso', name: 'siguientePaso', value: x.siguientePaso || '' })}
      ${x.source?.system === 'notion' ? '<p class="hint">Es un registro de Notion: el cambio se guarda aquí y se envía a Aprobaciones para escribirlo en Notion.</p>' : ''}
    </form>`,
    footer: '<button class="btn" data-close>Cancelar</button><button class="btn primary" data-save>Guardar</button>',
    onMount(el, close) {
      el.querySelector('[data-save]').addEventListener('click', () => {
        const v = readForm(el.querySelector('#an-form'));
        const patch = Object.fromEntries(Object.entries(v).filter(([k, val]) => (val || null) !== (x[k] ? String(x[k]).slice(0, k === 'fechaObjetivo' ? 10 : undefined) : null)).map(([k, val]) => [k, val || null]));
        if (Object.keys(patch).length) store.update('incidencias', id, patch);
        close(); toast(Object.keys(patch).length ? (x.source?.system === 'notion' ? 'Guardado · cambio enviado a Aprobaciones' : 'Análisis guardado') : 'Sin cambios'); done();
      });
    },
  });
}

export default {
  id: 'incidencias', title: 'Incidencias', icon: 'alert',
  render(view, params) {
    if (params[0] === 'nueva') { list(view); history.replaceState(null, '', '#/incidencias'); setTimeout(() => openForm(params[1] || ''), 30); return; }
    if (params[0]) return detail(view, params[0]);
    list(view);
  },
};
