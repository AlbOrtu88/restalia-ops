import * as store from '../core/store.js';
import { icon, badge, demoBadge, sourceBadge, empty, pageHead, seg, bindSeg, field, readForm, openSheet, confirmSheet, toast, on, avatar } from '../core/ui.js';
import { esc, matches, groupBy, fmtDate, relDay, isOverdue, isoDate, addDays, startOfDay, toDate, startOfWeek, sameDay, debounce } from '../core/utils.js';

const ESTADOS = ['Pendiente', 'En curso', 'Bloqueada', 'Hecha'];
const PRIOS = ['Crítica', 'Alta', 'Media', 'Baja'];
const PRIO_N = { 'Crítica': 0, 'Alta': 1, 'Media': 2, 'Baja': 3 };
const st = { view: 'lista', q: '', prio: '', mine: false, done: false };

const people = () => [...new Set(['Alberto', ...store.all('tareas').map((t) => t.responsable), ...store.all('locales').map((l) => l.responsable)].filter(Boolean))];

export function openTaskForm(task = {}, { onSaved } = {}) {
  const isNew = !task.id;
  const locs = [{ value: '', label: 'Sin local' }, ...store.all('locales').map((l) => ({ value: l.id, label: l.nombre }))];
  const prjs = [{ value: '', label: 'Sin proyecto' }, ...store.all('proyectos').map((p) => ({ value: p.id, label: p.nombre }))];
  openSheet({
    title: isNew ? 'Nueva tarea' : 'Editar tarea',
    body: `<form class="form" id="task-form">
      ${field({ label: 'Título', name: 'titulo', value: task.titulo, required: true, placeholder: '¿Qué hay que hacer?' })}
      ${field({ label: 'Descripción', name: 'descripcion', type: 'textarea', value: task.descripcion })}
      <div class="form-row">
        ${field({ label: 'Responsable', name: 'responsable', value: task.responsable || 'Alberto', attrs: 'list="people-dl"' })}
        ${field({ label: 'Fecha límite', name: 'limite', type: 'date', value: task.limite ? isoDate(task.limite) : isoDate(addDays(new Date(), 3)) })}
      </div>
      <datalist id="people-dl">${people().map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
      <div class="form-row">
        ${field({ label: 'Prioridad', name: 'prioridad', options: PRIOS, value: task.prioridad || 'Media' })}
        ${field({ label: 'Estado', name: 'estado', options: ESTADOS, value: task.estado || 'Pendiente' })}
      </div>
      <div class="form-row">
        ${field({ label: 'Proyecto', name: 'proyectoId', options: prjs, value: task.proyectoId || '' })}
        ${field({ label: 'Local', name: 'localId', options: locs, value: task.localId || '' })}
      </div>
      <p class="xs subtle">Se guarda en este dispositivo. Al conectar Notion se propondrá su alta en «Acciones y seguimientos» a través de Aprobaciones.</p>
    </form>`,
    footer: `${!isNew ? `<button class="btn danger" data-del style="margin-right:auto">${icon('trash', 'sm')}Eliminar</button>` : ''}<button class="btn" data-close>Cancelar</button><button class="btn primary" data-save>${isNew ? 'Crear tarea' : 'Guardar'}</button>`,
    onMount(el, close) {
      const form = el.querySelector('#task-form');
      const save = () => {
        if (!form.reportValidity()) return;
        const v = readForm(form);
        const rec = { ...v, limite: v.limite ? new Date(v.limite + 'T18:00').toISOString() : null, proyectoId: v.proyectoId || null, localId: v.localId || null };
        let saved;
        if (isNew) { saved = store.add('tareas', { ...rec, creada: new Date().toISOString(), evidencias: [], ...(task.origenRef ? { origenRef: task.origenRef } : {}) }, { prefix: 'tsk' }); store.log(`Alberto creó la tarea «${rec.titulo}»`, 'tareas'); toast('Tarea creada'); }
        else { saved = store.update('tareas', task.id, rec); toast('Tarea guardada'); }
        close(); onSaved?.(saved);
      };
      form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
      el.querySelector('[data-save]').addEventListener('click', save);
      el.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (await confirmSheet({ title: 'Eliminar tarea', text: 'Se eliminará de este dispositivo. No afecta a Notion.', confirm: 'Eliminar', danger: true })) { store.remove('tareas', task.id); close(); toast('Tarea eliminada'); onSaved?.(null); }
      });
    },
  });
}

function filtered() {
  return store.all('tareas').filter((t) =>
    (st.done || t.estado !== 'Hecha') && (!st.prio || t.prioridad === st.prio) && (!st.mine || t.responsable === 'Alberto') &&
    matches({ ...t, local: store.localName(t.localId), proyecto: store.projectName(t.proyectoId) }, st.q, ['titulo', 'descripcion', 'responsable', 'local', 'proyecto']))
    .sort((a, b) => (a.estado === 'Hecha') - (b.estado === 'Hecha') || toDate(a.limite || 8.64e15) - toDate(b.limite || 8.64e15) || PRIO_N[a.prioridad] - PRIO_N[b.prioridad]);
}

const prioDot = (p) => `<span title="Prioridad ${p}" style="width:8px;height:8px;border-radius:50%;flex:none;background:var(--${{ 'Crítica': 'red', 'Alta': 'amber', 'Media': 'accent', 'Baja': 'text-3' }[p]})"></span>`;
function row(t) {
  const over = isOverdue(t.limite, t.estado === 'Hecha');
  const done = t.estado === 'Hecha';
  return `<div class="li" data-task="${t.id}">
    <button class="btn ghost icon sm" data-toggle="${t.id}" aria-label="${done ? 'Reabrir' : 'Marcar como hecha'}" style="color:${done ? 'var(--green)' : 'var(--text-3)'}">${icon(done ? 'checksq' : 'check')}</button>
    <div class="li-main">
      <div class="li-title" style="${done ? 'text-decoration:line-through;color:var(--text-3)' : ''}">${esc(t.titulo)} ${demoBadge(t)}</div>
      <div class="li-sub">${esc(t.responsable || '—')}${t.localId ? ' · ' + esc(store.localName(t.localId)) : ''}${t.proyectoId ? ' · ' + esc(store.projectName(t.proyectoId)) : ''}</div>
    </div>
    ${prioDot(t.prioridad)}
    <span class="xs" style="white-space:nowrap;color:${over ? 'var(--red)' : 'var(--text-3)'};font-weight:${over ? 600 : 400}">${t.limite ? relDay(t.limite) : ''}</span>
    <span class="d-only">${badge(t.estado)}</span>
  </div>`;
}
const listCard = (items, title = '') => `<div class="card" style="margin-bottom:12px">${title ? `<div class="card-h"><h3>${title}</h3><span class="xs subtle">${items.length}</span></div>` : ''}<div class="list">${items.map(row).join('') || empty('No hay tareas con estos filtros', 'checksq')}</div></div>`;

function kanban(items) {
  const by = groupBy(items, 'estado');
  return `<div class="kanban">${ESTADOS.filter((e) => st.done || e !== 'Hecha').map((e) => `
    <div class="kcol" data-col="${e}"><div class="kcol-h">${badge(e)}<span class="n">${(by[e] || []).length}</span></div>
    ${(by[e] || []).map((t) => `<div class="kcard" draggable="true" data-task="${t.id}">
      <div class="row between">${prioDot(t.prioridad)}${demoBadge(t)}</div>
      <div class="kt">${esc(t.titulo)}</div>
      <div class="km">${avatar(t.responsable)}<span>${t.limite ? relDay(t.limite) : ''}</span>${t.localId ? `<span>· ${esc(store.localName(t.localId).replace('DEMO · ', ''))}</span>` : ''}</div>
      <select class="sel m-only" data-move="${t.id}" style="margin-top:8px;height:32px;width:100%" aria-label="Mover a">${ESTADOS.map((x) => `<option ${x === t.estado ? 'selected' : ''}>${x}</option>`).join('')}</select>
    </div>`).join('')}
    </div>`).join('')}</div>`;
}

function calendar(items) {
  const start = startOfWeek(new Date());
  const days = Array.from({ length: 14 }, (_, i) => addDays(start, i));
  const over = items.filter((t) => isOverdue(t.limite, t.estado === 'Hecha'));
  return `${over.length ? listCard(over, `<span style="color:var(--red)">Vencidas</span>`) : ''}
    ${days.map((d) => { const its = items.filter((t) => t.limite && sameDay(t.limite, d) && !isOverdue(t.limite, t.estado === 'Hecha'));
      return its.length ? listCard(its, `<span style="text-transform:capitalize">${d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}</span>`) : ''; }).join('')}
    ${listCard(items.filter((t) => t.limite && toDate(t.limite) >= addDays(start, 14)), 'Más adelante')}`;
}

function grouped(items, key, label) {
  const g = groupBy(items, (t) => t[key] || '');
  return Object.entries(g).sort(([a], [b]) => (a === '') - (b === '') || label(a).localeCompare(label(b))).map(([k, its]) => listCard(its, esc(label(k)))).join('') || empty('No hay tareas', 'checksq');
}

export default {
  id: 'tareas', title: 'Tareas', icon: 'checksq',
  render(view, params) {
    if (params[0] === 'nueva') { setTimeout(() => openTaskForm({}, { onSaved: () => { location.hash = '#/tareas'; } }), 30); history.replaceState(null, '', '#/tareas'); }
    const paint = () => {
      const items = filtered();
      const body = view.querySelector('#t-body');
      body.innerHTML = st.view === 'kanban' ? kanban(items) : st.view === 'calendario' ? calendar(items)
        : st.view === 'responsable' ? grouped(items, 'responsable', (k) => k || 'Sin responsable')
        : st.view === 'proyecto' ? grouped(items, 'proyectoId', (k) => (k ? store.projectName(k) : 'Sin proyecto'))
        : st.view === 'local' ? grouped(items, 'localId', (k) => (k ? store.localName(k) : 'Sin local')) : listCard(items);
      view.querySelector('#t-count').textContent = `${items.length} tareas`;
    };
    view.innerHTML = `
      ${pageHead('Tareas y acciones', 'Todo lo que tienes pendiente, ordenado por fecha límite.', `<button class="btn primary" data-new>${icon('plus', 'sm')}Nueva tarea</button>`)}
      <div class="toolbar">
        ${seg('tview', [{ value: 'lista', label: 'Lista', icon: 'list' }, { value: 'kanban', label: 'Kanban', icon: 'kanban' }, { value: 'calendario', label: 'Calendario', icon: 'calendar' }, { value: 'responsable', label: 'Responsable' }, { value: 'proyecto', label: 'Proyecto' }, { value: 'local', label: 'Local' }], st.view)}
      </div>
      <div class="toolbar">
        <div class="search">${icon('search', 'sm')}<input id="t-q" type="search" placeholder="Buscar tareas" value="${esc(st.q)}"></div>
        <select class="sel" id="t-prio" aria-label="Prioridad"><option value="">Todas las prioridades</option>${PRIOS.map((p) => `<option ${p === st.prio ? 'selected' : ''}>${p}</option>`).join('')}</select>
        <div class="chips"><button class="chip ${st.mine ? 'on' : ''}" data-chip="mine">Solo mías</button><button class="chip ${st.done ? 'on' : ''}" data-chip="done">Ver hechas</button></div>
        <span class="xs subtle" id="t-count" style="margin-left:auto"></span>
      </div>
      <div id="t-body"></div>`;
    paint();
    bindSeg(view, 'tview', (v) => { st.view = v; view.querySelectorAll('[data-seg="tview"] button').forEach((b) => b.classList.toggle('on', b.dataset.val === v)); paint(); });
    view.querySelector('#t-q').addEventListener('input', debounce((e) => { st.q = e.target.value; paint(); }, 150));
    view.querySelector('#t-prio').addEventListener('change', (e) => { st.prio = e.target.value; paint(); });
    on(view, 'click', '[data-chip]', (e, b) => { st[b.dataset.chip] = !st[b.dataset.chip]; b.classList.toggle('on'); paint(); });
    on(view, 'click', '[data-new]', () => openTaskForm({}, { onSaved: paint }));
    on(view, 'click', '[data-toggle]', (e, b) => {
      const t = store.find('tareas', b.dataset.toggle);
      const estado = t.estado === 'Hecha' ? 'Pendiente' : 'Hecha';
      store.update('tareas', t.id, { estado });
      if (estado === 'Hecha') { store.log(`Se completó la tarea «${t.titulo}»`, 'tareas'); toast('Tarea completada'); }
      paint();
    });
    on(view, 'click', '[data-task]', (e, el) => { if (e.target.closest('button,select')) return; openTaskForm(store.find('tareas', el.dataset.task), { onSaved: paint }); });
    on(view, 'change', '[data-move]', (e, s) => { store.update('tareas', s.dataset.move, { estado: s.value }); toast(`Movida a ${s.value}`); paint(); });
    // Arrastrar y soltar (escritorio)
    let drag = null;
    view.addEventListener('dragstart', (e) => { const c = e.target.closest('.kcard'); if (c) { drag = c.dataset.task; c.classList.add('dragging'); } });
    view.addEventListener('dragend', (e) => e.target.closest?.('.kcard')?.classList.remove('dragging'));
    view.addEventListener('dragover', (e) => { const col = e.target.closest('.kcol'); if (col) { e.preventDefault(); col.classList.add('over'); } });
    view.addEventListener('dragleave', (e) => e.target.closest?.('.kcol')?.classList.remove('over'));
    view.addEventListener('drop', (e) => { const col = e.target.closest('.kcol'); if (col && drag) { e.preventDefault(); store.update('tareas', drag, { estado: col.dataset.col }); drag = null; paint(); } });
    if (params[0] && params[0] !== 'nueva') { const t = store.find('tareas', params[0]); if (t) openTaskForm(t, { onSaved: paint }); }
  },
};
