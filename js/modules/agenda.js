import * as store from '../core/store.js';
import { icon, badge, demoBadge, empty, pageHead, seg, bindSeg, field, readForm, openSheet, toast, on, demoNotice } from '../core/ui.js';
import { esc, fmtTime, fmtDateLong, isoDate, addDays, addMonths, startOfDay, startOfWeek, startOfMonth, sameDay, isToday, toDate } from '../core/utils.js';
import { agendaItems } from '../core/insights.js';

const TYPES = [
  { id: 'reunion', label: 'Reuniones' }, { id: 'visita', label: 'Visitas' }, { id: 'auditoria', label: 'Auditorías' },
  { id: 'tarea', label: 'Tareas' }, { id: 'seguimiento', label: 'Seguimientos' }, { id: 'limite', label: 'Fechas límite' },
];
const LABEL = { reunion: 'Reunión', visita: 'Visita', auditoria: 'Auditoría', tarea: 'Tarea', seguimiento: 'Seguimiento', limite: 'Fecha límite' };
const H0 = 7, H1 = 22, HH = 52;
const st = { view: matchMedia('(max-width:860px)').matches ? 'dia' : 'semana', date: startOfDay(new Date()), off: new Set() };

const items = () => agendaItems().filter((x) => !st.off.has(x.tipo));
const ofDay = (list, d) => list.filter((x) => sameDay(x.inicio, d));

function title() {
  if (st.view === 'dia') return fmtDateLong(st.date);
  if (st.view === 'mes') return st.date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const a = startOfWeek(st.date), b = addDays(a, 6);
  return `${a.getDate()} – ${b.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function timeGrid(days, list, cls = '') {
  const cols = `52px repeat(${days.length}, minmax(0,1fr))`;
  const hours = Array.from({ length: H1 - H0 }, (_, i) => H0 + i);
  const now = new Date();
  const allDay = days.map((d) => ofDay(list, d).filter((x) => x.allDay));
  const hasAllDay = allDay.some((a) => a.length);
  return `<div class="tgrid ${cls}">
    <div class="tgrid-head" style="grid-template-columns:${cols}"><div></div>${days.map((d) => `<div class="${isToday(d) ? 'today' : ''}">${d.toLocaleDateString('es-ES', { weekday: 'short' })} <b>${d.getDate()}</b></div>`).join('')}</div>
    ${hasAllDay ? `<div class="tgrid-head" style="grid-template-columns:${cols}"><div class="xs subtle" style="text-align:right">Todo el día</div>${allDay.map((a) => `<div style="display:flex;flex-direction:column;gap:2px;text-align:left">${a.map((x) => `<div class="mev t-${x.tipo}" data-ev="${x.id}">${esc(x.titulo)}</div>`).join('')}</div>`).join('')}</div>` : ''}
    <div class="tgrid-body" style="grid-template-columns:${cols}">
      <div>${hours.map((h) => `<div class="thour">${String(h).padStart(2, '0')}:00</div>`).join('')}</div>
      ${days.map((d) => `<div class="tcol" data-day="${isoDate(d)}">${hours.map((h) => `<div class="tslot" data-slot="${h}"></div>`).join('')}
        ${ofDay(list, d).filter((x) => !x.allDay).map((x) => {
          const s = toDate(x.inicio), e = toDate(x.fin || s.getTime() + 3600e3);
          const top = ((s.getHours() + s.getMinutes() / 60) - H0) * HH, hgt = Math.max(24, ((e - s) / 3600e3) * HH - 2);
          return `<div class="tev t-${x.tipo}" data-ev="${x.id}" style="top:${Math.max(0, top)}px;height:${hgt}px"><b>${esc(x.titulo)}</b>${fmtTime(s)}${x.ubicacion ? ' · ' + esc(x.ubicacion) : ''}</div>`;
        }).join('')}
        ${isToday(d) && now.getHours() >= H0 && now.getHours() < H1 ? `<div class="now-line" style="top:${((now.getHours() + now.getMinutes() / 60) - H0) * HH}px"></div>` : ''}
      </div>`).join('')}
    </div></div>`;
}

function dayList(list, d) {
  const its = ofDay(list, d);
  return `<div class="card agenda-list">${its.length ? its.map((x) => `
    <div class="ag-item" data-ev="${x.id}">
      <div class="ag-time">${x.allDay ? 'Día' : fmtTime(x.inicio)}<span>${x.allDay ? '' : fmtTime(x.fin || x.inicio)}</span></div>
      <span class="ag-bar t-${x.tipo}" style="background:var(--c)"></span>
      <div class="grow"><div style="font-weight:560">${esc(x.titulo)} ${demoBadge(x)}</div>
      <div class="small subtle">${LABEL[x.tipo]}${x.ubicacion ? ' · ' + esc(x.ubicacion) : ''}${x.responsable ? ' · ' + esc(x.responsable) : ''}</div></div>
      ${badge(x.estado)}
    </div>`).join('') : empty('Nada programado este día', 'calendar')}</div>`;
}

function dayStrip(list) {
  const a = startOfWeek(st.date);
  return `<div class="daystrip">${Array.from({ length: 7 }, (_, i) => addDays(a, i)).map((d) => `<button data-pick="${isoDate(d)}" class="${sameDay(d, st.date) ? 'on' : ''}">${d.toLocaleDateString('es-ES', { weekday: 'narrow' })}<b>${d.getDate()}</b>${ofDay(list, d).length ? '<i></i>' : '<i style="opacity:0"></i>'}</button>`).join('')}</div>`;
}

function month(list) {
  const first = startOfMonth(st.date), start = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return `<div class="month">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => `<div class="dow">${d}</div>`).join('')}
    ${days.map((d) => { const its = ofDay(list, d);
      return `<div class="mday ${d.getMonth() !== first.getMonth() ? 'other' : ''} ${isToday(d) ? 'today' : ''} ${sameDay(d, st.date) ? 'sel' : ''}" data-pick="${isoDate(d)}">
        <span class="dn">${d.getDate()}</span>
        ${its.slice(0, 3).map((x) => `<div class="mev t-${x.tipo}">${x.allDay ? '' : fmtTime(x.inicio) + ' '}${esc(x.titulo)}</div>`).join('')}${its.length > 3 ? `<div class="xs subtle">+${its.length - 3} más</div>` : ''}
        <div class="mdots">${its.slice(0, 4).map((x) => `<i class="t-${x.tipo}" style="background:var(--c)"></i>`).join('')}</div>
      </div>`; }).join('')}</div>
    <div class="section-title"><h2 style="text-transform:capitalize">${fmtDateLong(st.date)}</h2></div>${dayList(list, st.date)}`;
}

function openEvent(x) {
  if (!x) return;
  const raw = x.kind === 'evento' ? store.find('eventos', x.id) : null;
  openSheet({
    title: x.titulo,
    body: `<div class="row wrap" style="margin-bottom:14px">${badge(LABEL[x.tipo], { reunion: 'blue', visita: 'green', auditoria: 'purple', tarea: 'teal', seguimiento: 'amber', limite: 'red' }[x.tipo])}${badge(x.estado)}${demoBadge(x)}</div>
      <dl class="props">
        <dt>Cuándo</dt><dd style="text-transform:capitalize">${fmtDateLong(x.inicio)}${x.allDay ? '' : ` · ${fmtTime(x.inicio)}–${fmtTime(x.fin || x.inicio)}`}</dd>
        <dt>Lugar</dt><dd>${x.localId ? `<a href="#/locales/${x.localId}">${esc(x.ubicacion)}</a>` : esc(x.ubicacion || '—')}</dd>
        <dt>Responsable</dt><dd>${esc(x.responsable || '—')}</dd>
        <dt>Origen</dt><dd>${x.demo ? 'Ejemplo DEMO' : x.kind === 'evento' ? 'Creado en esta app (pendiente de sincronizar)' : 'Generado desde ' + x.kind}</dd>
      </dl>`,
    footer: `${x.href ? `<a class="btn" href="${x.href}" data-close>Abrir ${x.kind}</a>` : ''}${raw && !raw.demo ? `<button class="btn danger" data-del>${icon('trash', 'sm')}Eliminar</button>` : ''}<button class="btn primary" data-close>Cerrar</button>`,
    onMount(el, close) { el.querySelector('[data-del]')?.addEventListener('click', () => { store.remove('eventos', raw.id); close(); toast('Evento eliminado'); }); },
  });
}

function openNew(date = st.date, hour = 9) {
  const locs = [{ value: '', label: 'Sin local' }, ...store.all('locales').map((l) => ({ value: l.id, label: l.nombre }))];
  openSheet({
    title: 'Nuevo evento',
    body: `<form class="form" id="ev-form">
      ${field({ label: 'Título', name: 'titulo', required: true })}
      ${field({ label: 'Tipo', name: 'tipo', options: TYPES.map((t) => ({ value: t.id, label: LABEL[t.id] })), value: 'reunion' })}
      <div class="form-row">${field({ label: 'Día', name: 'dia', type: 'date', value: isoDate(date), required: true })}
      <div class="form-row" style="grid-template-columns:1fr 1fr">${field({ label: 'Inicio', name: 'ini', type: 'time', value: `${String(hour).padStart(2, '0')}:00` })}${field({ label: 'Fin', name: 'fin', type: 'time', value: `${String(hour + 1).padStart(2, '0')}:00` })}</div></div>
      ${field({ label: 'Local', name: 'localId', options: locs })}
      ${field({ label: 'Ubicación', name: 'ubicacion', placeholder: 'Teams, oficina…' })}
      ${field({ label: 'Responsable', name: 'responsable', value: 'Alberto' })}
      <p class="xs subtle">Se guarda en esta app. No se crea en Outlook ni en Agenda Restalia hasta que conectes y apruebes la sincronización.</p>
    </form>`,
    footer: '<button class="btn" data-close>Cancelar</button><button class="btn primary" data-save>Crear evento</button>',
    onMount(el, close) {
      const f = el.querySelector('#ev-form');
      const save = () => {
        if (!f.reportValidity()) return;
        const v = readForm(f);
        store.add('eventos', { titulo: v.titulo, tipo: v.tipo, inicio: new Date(`${v.dia}T${v.ini}`).toISOString(), fin: new Date(`${v.dia}T${v.fin || v.ini}`).toISOString(), localId: v.localId || null, ubicacion: v.localId ? store.localName(v.localId) : v.ubicacion, responsable: v.responsable, estado: 'Confirmado' }, { prefix: 'ev' });
        store.log(`Alberto añadió «${v.titulo}» a la agenda`, 'agenda');
        close(); toast('Evento creado'); st.date = startOfDay(new Date(v.dia + 'T12:00')); location.hash = '#/agenda';
      };
      f.addEventListener('submit', (e) => { e.preventDefault(); save(); });
      el.querySelector('[data-save]').addEventListener('click', save);
    },
  });
}

export default {
  id: 'agenda', title: 'Agenda', icon: 'calendar',
  render(view, params) {
    if (params[0] === 'nuevo') { setTimeout(() => openNew(), 30); history.replaceState(null, '', '#/agenda'); }
    if (params[0] === 'dia') st.view = 'dia';
    const mobile = () => matchMedia('(max-width:860px)').matches;
    const paint = () => {
      const list = items();
      view.querySelector('#cal-title').textContent = title();
      view.querySelectorAll('[data-seg="cview"] button').forEach((b) => b.classList.toggle('on', b.dataset.val === st.view));
      const body = view.querySelector('#cal-body');
      if (st.view === 'mes') body.innerHTML = month(list);
      else if (st.view === 'semana') body.innerHTML = `${timeGrid(Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(st.date), i)), list, 'week')}<div class="m-only">${dayStrip(list)}${dayList(list, st.date)}</div>`;
      else body.innerHTML = mobile() ? `${dayStrip(list)}${dayList(list, st.date)}` : `<div class="grid" style="grid-template-columns:minmax(0,1fr) 340px;align-items:start">${timeGrid([st.date], list)}<div>${dayList(list, st.date)}</div></div>`;
      const sc = body.querySelector('.tgrid-body'); if (sc) sc.scrollTop = (Math.max(H0, Math.min(new Date().getHours(), 18)) - H0 - 1) * HH;
    };
    view.innerHTML = `
      ${pageHead('Agenda', 'Reuniones, visitas, auditorías, tareas y fechas límite en un solo calendario.', `<button class="btn primary" data-new>${icon('plus', 'sm')}Nuevo evento</button>`)}
      ${demoNotice('<b>Agenda de ejemplo.</b> Outlook Calendar y Agenda Restalia (Notion) no están conectados. Al conectarlos se mostrarán aquí sin crear calendarios duplicados.')}
      <div class="cal-head" style="margin-top:14px">
        <button class="btn icon sm" data-nav-cal="-1" aria-label="Anterior">${icon('left', 'sm')}</button>
        <button class="btn sm" data-today>Hoy</button>
        <button class="btn icon sm" data-nav-cal="1" aria-label="Siguiente">${icon('right', 'sm')}</button>
        <h2 id="cal-title"></h2>
        <div style="margin-left:auto">${seg('cview', [{ value: 'dia', label: 'Día' }, { value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mes' }], st.view)}</div>
      </div>
      <div class="chips" style="margin-bottom:14px">${TYPES.map((t) => `<button class="chip ${st.off.has(t.id) ? '' : 'on'}" data-type="${t.id}"><span class="sw t-${t.id}" style="background:var(--c)"></span>${t.label}</button>`).join('')}</div>
      <div id="cal-body"></div>`;
    paint();
    bindSeg(view, 'cview', (v) => { st.view = v; paint(); });
    on(view, 'click', '[data-nav-cal]', (e, b) => { const n = +b.dataset.navCal; st.date = st.view === 'mes' ? addMonths(st.date, n) : addDays(st.date, st.view === 'semana' ? 7 * n : n); paint(); });
    on(view, 'click', '[data-today]', () => { st.date = startOfDay(new Date()); paint(); });
    on(view, 'click', '[data-type]', (e, b) => { const t = b.dataset.type; st.off.has(t) ? st.off.delete(t) : st.off.add(t); b.classList.toggle('on'); paint(); });
    on(view, 'click', '[data-pick]', (e, b) => { st.date = startOfDay(new Date(b.dataset.pick + 'T12:00')); paint(); });
    on(view, 'click', '[data-ev]', (e, el) => { e.stopPropagation(); openEvent(agendaItems().find((x) => x.id === el.dataset.ev)); });
    on(view, 'click', '[data-new]', () => openNew());
    on(view, 'click', '.tslot', (e, s) => openNew(new Date(s.parentElement.dataset.day + 'T12:00'), +s.dataset.slot));
    // Deslizar para cambiar de día/semana/mes en iPhone
    let x0 = null, y0 = null;
    view.addEventListener('touchstart', (e) => { if (e.target.closest('#cal-body')) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } }, { passive: true });
    view.addEventListener('touchend', (e) => {
      if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) { const n = dx < 0 ? 1 : -1; st.date = st.view === 'mes' ? addMonths(st.date, n) : addDays(st.date, st.view === 'semana' ? 7 * n : n); paint(); }
    });
  },
};
