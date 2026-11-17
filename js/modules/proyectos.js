// Proyectos (capa C: la app es la fuente hasta que se confirme si existe una base en Notion).
import * as store from '../core/store.js';
import { icon, badge, demoBadge, empty, pageHead, seg, bindSeg, field, readForm, openSheet, confirmSheet, toast, on, progress, avatar } from '../core/ui.js';
import { esc, fmtDate, fmtDateFull, isoDate, addDays, toDate, isOverdue, relTime, diffDays } from '../core/utils.js';
import { openTaskForm } from './tareas.js';

const ESTADOS = ['Planificado', 'En curso', 'En pausa', 'Completado'];
const COLORES = ['blue', 'green', 'purple', 'amber', 'teal', 'red'];
const st = { estado: 'activos' };

function metrics(p) {
  const t = store.all('tareas').filter((x) => x.proyectoId === p.id);
  const done = t.filter((x) => x.estado === 'Hecha').length;
  const venc = t.filter((x) => isOverdue(x.limite, ['Hecha', 'Cancelada'].includes(x.estado))).length;
  const pct = t.length ? Math.round((done / t.length) * 100) : (p.estado === 'Completado' ? 100 : 0);
  return { tareas: t, total: t.length, done, venc, pct };
}

function projectForm(p = {}, onSaved) {
  const isNew = !p.id;
  openSheet({
    title: isNew ? 'Nuevo proyecto' : 'Editar proyecto',
    body: `<form class="form" id="prj-form">
      ${field({ label: 'Nombre', name: 'nombre', value: p.nombre, required: true })}
      ${field({ label: 'Descripción', name: 'descripcion', type: 'textarea', value: p.descripcion })}
      <div class="form-row">
        ${field({ label: 'Responsable', name: 'responsable', value: p.responsable || 'Alberto' })}
        ${field({ label: 'Estado', name: 'estado', options: ESTADOS, value: p.estado || 'Planificado' })}
      </div>
      <div class="form-row">
        ${field({ label: 'Inicio', name: 'inicio', type: 'date', value: isoDate(p.inicio || new Date()) })}
        ${field({ label: 'Fin previsto', name: 'fin', type: 'date', value: isoDate(p.fin || addDays(new Date(), 60)) })}
      </div>
      ${field({ label: 'Color', name: 'color', options: COLORES.map((c) => ({ value: c, label: { blue: 'Azul', green: 'Verde', purple: 'Morado', amber: 'Ámbar', teal: 'Turquesa', red: 'Rojo' }[c] })), value: p.color || 'blue' })}
    </form>`,
    footer: `${!isNew && !p.demo ? `<button class="btn danger" data-del>${icon('trash', 'sm')}Eliminar</button>` : ''}<button class="btn" data-close>Cancelar</button><button class="btn primary" type="submit" form="prj-form">${isNew ? 'Crear proyecto' : 'Guardar'}</button>`,
    onMount(el, close) {
      el.querySelector('#prj-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const d = readForm(e.target);
        if (!d.nombre) { toast('Pon un nombre al proyecto', 'alert'); return; }
        const rec = { ...d, inicio: new Date(`${d.inicio}T09:00`).toISOString(), fin: new Date(`${d.fin}T18:00`).toISOString() };
        let saved;
        if (isNew) { saved = store.add('proyectos', rec, { prefix: 'pry' }); store.log(`Alberto creó el proyecto «${d.nombre}»`, 'proyectos'); toast('Proyecto creado'); }
        else { saved = store.update('proyectos', p.id, rec); toast('Proyecto guardado'); }
        close(); onSaved?.(saved);
      });
      el.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!(await confirmSheet({ title: 'Eliminar proyecto', text: 'Las tareas del proyecto se conservan, pero quedarán sin proyecto.', confirm: 'Eliminar', danger: true }))) return;
        store.all('tareas').filter((t) => t.proyectoId === p.id).forEach((t) => store.update('tareas', t.id, { proyectoId: null }));
        store.remove('proyectos', p.id); close(); location.hash = '#/proyectos'; toast('Proyecto eliminado');
      });
    },
  });
}

function list(view) {
  const all = store.all('proyectos');
  const shown = all.filter((p) => st.estado === 'todos' || (st.estado === 'activos' ? p.estado !== 'Completado' : p.estado === 'Completado'));
  view.innerHTML = `
    ${pageHead('Proyectos', 'Iniciativas con sus tareas, avance y conversaciones con el asistente.', `<button class="btn primary" data-newp>${icon('plus', 'sm')}<span>Nuevo proyecto</span></button>`)}
    <div class="toolbar">${seg('pst', [{ value: 'activos', label: `Activos (${all.filter((p) => p.estado !== 'Completado').length})` }, { value: 'completados', label: 'Completados' }, { value: 'todos', label: 'Todos' }], st.estado)}</div>
    <div class="grid g3">${shown.map((p) => {
      const m = metrics(p);
      const left = diffDays(p.fin, new Date());
      return `<div class="card pad click" data-href="#/proyectos/${p.id}" style="border-top:3px solid var(--${p.color || 'accent'})">
        <div class="row between" style="gap:8px;align-items:flex-start"><h3 style="margin:0;font-size:15.5px">${esc(p.nombre)}</h3>${badge(p.estado, { 'En curso': 'blue', 'Planificado': 'purple', 'En pausa': 'amber', 'Completado': 'green' }[p.estado])}</div>
        <p class="small subtle" style="margin:6px 0 14px;min-height:38px">${esc(p.descripcion || '')}</p>
        <div class="row between xs subtle" style="margin-bottom:6px"><span>${m.done}/${m.total} tareas</span><b style="color:var(--text)">${m.pct}%</b></div>
        ${progress(m.pct)}
        <div class="row between" style="margin-top:14px;gap:8px">
          <span class="row" style="gap:6px">${avatar(p.responsable)}<span class="xs subtle">${esc(p.responsable)}</span></span>
          <span class="xs ${left < 0 && p.estado !== 'Completado' ? 'down' : 'subtle'}">${p.estado === 'Completado' ? `Fin ${fmtDate(p.fin)}` : left < 0 ? `Retrasado ${-left} d` : `Quedan ${left} d`}</span>
        </div>
        ${m.venc ? `<div style="margin-top:10px">${badge(`${m.venc} vencidas`, 'red')}</div>` : ''} ${demoBadge(p)}
      </div>`;
    }).join('') || empty('No hay proyectos en este filtro.', 'target')}</div>`;
  bindSeg(view, 'pst', (v) => { st.estado = v; list(view); });
  view.querySelector('[data-newp]').addEventListener('click', () => projectForm({}, (p) => { location.hash = `#/proyectos/${p.id}`; }));
}

function detail(view, id) {
  const p = store.find('proyectos', id);
  if (!p) { view.innerHTML = empty('Proyecto no encontrado.', 'target'); return; }
  const m = metrics(p);
  const convs = store.ai.conversations().filter((c) => c.projectId === p.id);
  const tasks = m.tareas.slice().sort((a, b) => (['Hecha', 'Cancelada'].includes(a.estado)) - (['Hecha', 'Cancelada'].includes(b.estado)) || toDate(a.limite || 8.64e15) - toDate(b.limite || 8.64e15));
  const locs = [...new Set(m.tareas.map((t) => t.localId).filter(Boolean))];
  view.innerHTML = `
    <a class="btn ghost sm" href="#/proyectos" style="margin:6px 0 4px 0">${icon('left', 'sm')}Proyectos</a>
    ${pageHead(p.nombre, `${esc(p.descripcion || '')}`, `<button class="btn" data-edit>${icon('edit', 'sm')}<span>Editar</span></button><button class="btn primary" data-addtask>${icon('plus', 'sm')}<span>Tarea</span></button>`)}
    <div class="row wrap" style="gap:6px;margin-bottom:14px">${badge(p.estado)} ${demoBadge(p)} <span class="badge">${icon('calendar', 'sm')}${fmtDateFull(p.inicio)} → ${fmtDateFull(p.fin)}</span> <span class="badge">${icon('user', 'sm')}${esc(p.responsable)}</span></div>
    <div class="grid g4 keep2">
      <div class="card kpi"><div class="k-label">Avance</div><div class="k-value">${m.pct}%</div><div class="k-foot">${progress(m.pct)}</div></div>
      <div class="card kpi"><div class="k-label">Tareas</div><div class="k-value">${m.total}</div><div class="k-foot">${m.done} hechas</div></div>
      <div class="card kpi"><div class="k-label">Vencidas</div><div class="k-value">${m.venc}</div><div class="k-foot">${m.venc ? '<span class="down">requieren atención</span>' : 'al día'}</div></div>
      <div class="card kpi"><div class="k-label">Locales implicados</div><div class="k-value">${locs.length}</div><div class="k-foot">${locs.slice(0, 2).map((l) => esc(store.localName(l))).join(', ') || '—'}</div></div>
    </div>
    <div class="grid g21" style="margin-top:16px">
      <div class="card"><div class="card-h"><h3>Tareas del proyecto</h3><a class="btn ghost sm" href="#/tareas">Todas ${icon('right', 'sm')}</a></div>
        <div class="list">${tasks.map((t) => `
          <div class="li" data-task="${t.id}" style="cursor:pointer">
            <button class="btn ghost icon sm" data-done="${t.id}" aria-label="${['Hecha', 'Cancelada'].includes(t.estado) ? 'Reabrir' : 'Marcar como hecha'}" style="color:${['Hecha', 'Cancelada'].includes(t.estado) ? 'var(--green)' : 'var(--text-3)'}">${icon(['Hecha', 'Cancelada'].includes(t.estado) ? 'checksq' : 'check')}</button>
            <div class="li-main"><div class="li-title" style="${['Hecha', 'Cancelada'].includes(t.estado) ? 'text-decoration:line-through;color:var(--text-3)' : ''}">${esc(t.titulo)} ${demoBadge(t)}</div>
            <div class="li-sub">${esc(t.responsable)} · ${t.limite ? fmtDate(t.limite) : 'sin fecha'}${t.localId ? ` · ${esc(store.localName(t.localId))}` : ''}</div></div>
            ${isOverdue(t.limite, ['Hecha', 'Cancelada'].includes(t.estado)) ? badge('Vencida', 'red') : badge(t.estado)}
          </div>`).join('') || empty('Sin tareas. Añade la primera.', 'checksq')}</div></div>
      <div class="stack" style="gap:16px">
        <div class="card"><div class="card-h"><h3>Asistente</h3></div><div class="card-b">
          <p class="small subtle" style="margin-top:0">Conversaciones guardadas en este proyecto.</p>
          <div class="list">${convs.map((c) => `<div class="li" data-href="#/asistente/${c.id}"><span class="li-icon">${icon('chat', 'sm')}</span><div class="li-main"><div class="li-title">${esc(c.title)}</div><div class="li-sub">${c.messages.length} mensajes · ${relTime(c.updatedAt || c.createdAt)}</div></div></div>`).join('')}</div>
          <button class="btn" style="width:100%;justify-content:center;margin-top:10px" data-conv>${icon('sparkles', 'sm')}Nueva conversación del proyecto</button>
        </div></div>
      </div>
    </div>`;
  const $ = (s) => view.querySelector(s);
  const reload = () => detail(view, id);
  $('[data-edit]').addEventListener('click', () => projectForm(p, reload));
  $('[data-addtask]').addEventListener('click', () => openTaskForm({ proyectoId: p.id }, { onSaved: reload }));
  $('[data-conv]').addEventListener('click', () => { const c = store.ai.create(`Proyecto: ${p.nombre}`.slice(0, 50), p.id); location.hash = `#/asistente/${c.id}`; });
  on(view, 'click', '[data-done]', (e, b) => { e.stopPropagation(); const t = store.find('tareas', b.dataset.done); store.update('tareas', t.id, { estado: ['Hecha', 'Cancelada'].includes(t.estado) ? 'Pendiente' : 'Hecha' }); if (!['Hecha', 'Cancelada'].includes(t.estado)) store.log(`Alberto completó «${t.titulo}»`, 'tareas'); reload(); });
  on(view, 'click', '[data-task]', (e, el) => { if (e.target.closest('[data-done]')) return; openTaskForm(store.find('tareas', el.dataset.task), { onSaved: reload }); });
}

export default {
  id: 'proyectos', title: 'Proyectos', icon: 'target',
  render(view, params = []) { if (params[0]) detail(view, params[0]); else list(view); },
};
