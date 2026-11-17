// Informes: KPIs y gráficos calculados con los datos cargados. Exporta a PDF (imprimir) y a Excel (CSV).
import * as store from '../core/store.js';
import { icon, badge, demoNotice, pageHead, seg, bindSeg, kpi, empty, toast, on, scoreCls } from '../core/ui.js';
import { esc, addDays, startOfDay, toDate, fmtDate, fmtDateFull, fmtDateTime, isOverdue, groupBy, diffDays, download, toCSV } from '../core/utils.js';
import { bars, hbars, stacked, SERIES } from '../core/charts.js';

const REPORTS = [
  { id: 'resumen', label: 'Resumen ejecutivo', ic: 'chart' },
  { id: 'visitas', label: 'Visitas', ic: 'pin' },
  { id: 'incidencias', label: 'Incidencias', ic: 'alert' },
  { id: 'auditorias', label: 'Auditorías', ic: 'audit' },
  { id: 'tareas', label: 'Tareas y acciones', ic: 'checksq' },
  { id: 'locales', label: 'Ranking de locales', ic: 'store' },
  { id: 'aprobaciones', label: 'Aprobaciones', ic: 'approve' },
  { id: 'actividad', label: 'Actividad', ic: 'history' },
];
const PERIODS = [{ value: '7', label: '7 días' }, { value: '30', label: '30 días' }, { value: '90', label: '90 días' }, { value: '365', label: '12 meses' }];
const st = { period: '30' };
const OPEN_INC = (i) => !['Resuelta', 'Cerrada'].includes(i.estado);
const PRIO_C = { 'Crítica': 'var(--red)', 'Alta': 'var(--amber)', 'Media': 'var(--accent)', 'Baja': 'var(--text-3)' };

function range() { const days = Number(st.period); return { from: addDays(startOfDay(new Date()), -days + 1), to: new Date(), days }; }
const inR = (v, r) => { const d = toDate(v); return v && d >= r.from && d <= r.to; };

/** Serie temporal: semanas si el periodo es > 30 días, días si no (máx. 14 cubos) */
function series(items, field, r) {
  const [n, step] = r.days <= 14 ? [r.days, 1] : r.days <= 90 ? [Math.ceil(r.days / 7), 7] : [12, 30];
  const buckets = [];
  for (let i = n - 1; i >= 0; i--) {
    const end = addDays(startOfDay(new Date()), -i * step + 1), start = addDays(end, -step);
    const v = items.filter((x) => { const d = toDate(x[field]); return d >= start && d < end; }).length;
    const label = step === 1 ? fmtDate(start, { day: 'numeric' }) : step === 30 ? fmtDate(start, { month: 'short' }) : fmtDate(start);
    buckets.push({ label, value: v, tip: `${step === 1 ? fmtDate(start) : `${fmtDate(start)} – ${fmtDate(addDays(end, -1))}`}: ${v}` });
  }
  return buckets;
}
const card = (title, html, sub = '') => `<div class="card"><div class="card-h"><h3>${esc(title)}</h3>${sub ? `<span class="xs subtle">${esc(sub)}</span>` : ''}</div><div class="card-b">${html}</div></div>`;

const R = {
  resumen(r) {
    const vis = store.all('visitas').filter((v) => inR(v.fecha, r));
    const inc = store.all('incidencias').filter((i) => inR(i.fecha, r));
    const aud = store.all('auditorias').filter((a) => a.estado === 'Completada' && inR(a.fecha, r));
    const t = store.all('tareas');
    const media = aud.length ? Math.round(aud.reduce((s, a) => s + a.puntuacion, 0) / aud.length) : null;
    const open = store.all('incidencias').filter(OPEN_INC);
    return {
      kpis: [
        { label: 'Visitas', value: vis.length, ic: 'pin', foot: (() => { const c = vis.filter((v) => v.resultado === 'Crítica').length; return `${c} ${c === 1 ? 'crítica' : 'críticas'}`; })() },
        { label: 'Incidencias nuevas', value: inc.length, ic: 'alert', foot: `${open.length} abiertas hoy` },
        { label: 'Nota media auditorías', value: media ?? '—', ic: 'audit', foot: `${aud.length} completadas` },
        { label: 'Tareas vencidas', value: t.filter((x) => isOverdue(x.limite, ['Hecha', 'Cancelada'].includes(x.estado))).length, ic: 'clock', foot: `${t.filter((x) => !['Hecha', 'Cancelada'].includes(x.estado)).length} abiertas` },
      ],
      charts: [
        card('Visitas en el periodo', bars(series(store.all('visitas'), 'fecha', r), { color: 'var(--green)', highlightLast: true })),
        card('Incidencias nuevas en el periodo', bars(series(store.all('incidencias'), 'fecha', r), { color: 'var(--red)', highlightLast: true })),
        card('Incidencias abiertas por prioridad', stacked(['Crítica', 'Alta', 'Media', 'Baja'].map((p) => ({ label: p, value: open.filter((i) => i.prioridad === p).length, color: PRIO_C[p] })))),
        card('Tareas por estado', stacked(['Pendiente', 'En curso', 'Bloqueada', 'Hecha'].map((e, i) => ({ label: e, value: t.filter((x) => x.estado === e).length, color: ['var(--amber)', 'var(--accent)', 'var(--red)', 'var(--green)'][i] })))),
      ],
      table: { title: 'Indicadores', cols: [{ label: 'Indicador', key: 'k' }, { label: 'Valor', key: 'v' }], rows: [
        { k: 'Visitas', v: vis.length }, { k: 'Incidencias nuevas', v: inc.length }, { k: 'Incidencias abiertas', v: open.length },
        { k: 'Auditorías completadas', v: aud.length }, { k: 'Nota media auditorías', v: media ?? '' },
        { k: 'Tareas abiertas', v: t.filter((x) => !['Hecha', 'Cancelada'].includes(x.estado)).length }, { k: 'Tareas vencidas', v: t.filter((x) => isOverdue(x.limite, ['Hecha', 'Cancelada'].includes(x.estado))).length },
      ] },
    };
  },
  visitas(r) {
    const vis = store.all('visitas').filter((v) => inR(v.fecha, r)).sort((a, b) => toDate(b.fecha) - toDate(a.fecha));
    const byRes = groupBy(vis, 'resultado');
    const byLoc = Object.entries(groupBy(vis, 'localId')).sort((a, b) => b[1].length - a[1].length);
    const sin = store.all('locales').filter((l) => l.estado === 'Abierto' && !vis.some((v) => v.localId === l.id));
    return {
      kpis: [
        { label: 'Visitas', value: vis.length, ic: 'pin' },
        { label: 'Satisfactorias', value: (byRes['Satisfactoria'] || []).length, ic: 'check' },
        { label: 'Con incidencias o críticas', value: (byRes['Con incidencias'] || []).length + (byRes['Crítica'] || []).length, ic: 'alert' },
        { label: 'Locales sin visita', value: sin.length, ic: 'store', foot: 'abiertos, en el periodo' },
      ],
      charts: [
        card('Visitas por periodo', bars(series(store.all('visitas'), 'fecha', r), { color: 'var(--green)', highlightLast: true })),
        card('Resultado', stacked([['Satisfactoria', 'var(--green)'], ['Con incidencias', 'var(--amber)'], ['Crítica', 'var(--red)']].map(([l, c]) => ({ label: l, value: (byRes[l] || []).length, color: c })))
          + `<h4 style="margin:18px 0 10px;font-size:13px">Más visitados</h4>${hbars(byLoc.slice(0, 5).map(([id, l]) => ({ label: store.localName(id), value: l.length })), { color: 'var(--green)' })}`),
      ],
      table: { title: 'Detalle de visitas', cols: [{ label: 'Fecha', get: (v) => fmtDateTime(v.fecha) }, { label: 'Local', get: (v) => store.localName(v.localId) }, { label: 'Motivo', key: 'motivo' }, { label: 'Resultado', key: 'resultado' }, { label: 'Responsable', key: 'responsable' }, { label: 'DEMO', get: (v) => (v.demo ? 'Sí' : 'No') }], rows: vis, href: (v) => `#/visitas/${v.id}` },
    };
  },
  incidencias(r) {
    const all = store.all('incidencias');
    const inc = all.filter((i) => inR(i.fecha, r));
    const open = all.filter(OPEN_INC);
    const closed = inc.filter((i) => !OPEN_INC(i));
    const avgAge = open.length ? Math.round(open.reduce((s, i) => s + diffDays(new Date(), i.fecha), 0) / open.length) : 0;
    const byCat = Object.entries(groupBy(open, 'categoria')).sort((a, b) => b[1].length - a[1].length);
    return {
      kpis: [
        { label: 'Nuevas en el periodo', value: inc.length, ic: 'alert' },
        { label: 'Abiertas ahora', value: open.length, ic: 'flag', foot: `${open.filter((i) => i.prioridad === 'Crítica').length} críticas` },
        { label: 'Resueltas o cerradas', value: closed.length, ic: 'check', foot: 'de las nuevas del periodo' },
        { label: 'Antigüedad media', value: `${avgAge} d`, ic: 'clock', foot: 'de las abiertas' },
      ],
      charts: [
        card('Nuevas por periodo', bars(series(all, 'fecha', r), { color: 'var(--red)', highlightLast: true })),
        card('Abiertas por categoría', hbars(byCat.map(([c, l]) => ({ label: c, value: l.length })), { color: 'var(--red)' })),
      ],
      table: { title: 'Incidencias del periodo', cols: [{ label: 'ID', key: 'id' }, { label: 'Fecha', get: (i) => fmtDate(i.fecha) }, { label: 'Local', get: (i) => store.localName(i.localId) }, { label: 'Título', key: 'titulo' }, { label: 'Categoría', key: 'categoria' }, { label: 'Prioridad', key: 'prioridad' }, { label: 'Estado', key: 'estado' }, { label: 'Responsable', key: 'responsable' }], rows: inc.sort((a, b) => toDate(b.fecha) - toDate(a.fecha)), href: (i) => `#/incidencias/${i.id}` },
    };
  },
  auditorias(r) {
    const done = store.all('auditorias').filter((a) => a.estado === 'Completada' && inR(a.fecha, r)).sort((a, b) => toDate(b.fecha) - toDate(a.fecha));
    const pend = store.all('auditorias').filter((a) => a.estado !== 'Completada');
    const media = done.length ? Math.round(done.reduce((s, a) => s + a.puntuacion, 0) / done.length) : null;
    const hall = done.reduce((s, a) => s + (a.hallazgos?.length || 0), 0);
    return {
      kpis: [
        { label: 'Completadas', value: done.length, ic: 'audit' },
        { label: 'Nota media', value: media ?? '—', ic: 'target', foot: media == null ? '' : media >= 85 ? 'buena' : media >= 70 ? 'mejorable' : '<span class="down">baja</span>' },
        { label: 'Hallazgos', value: hall, ic: 'flag' },
        { label: 'Pendientes', value: pend.length, ic: 'calendar', foot: 'programadas o en curso' },
      ],
      charts: [card('Nota por auditoría', hbars(done.map((a) => ({ label: `${store.localName(a.localId)} · ${fmtDate(a.fecha)}`, value: a.puntuacion, color: a.puntuacion >= 85 ? 'var(--green)' : a.puntuacion >= 70 ? 'var(--amber)' : 'var(--red)' })), { max: 100 }), '0–100')],
      table: { title: 'Auditorías completadas', cols: [{ label: 'Fecha', get: (a) => fmtDate(a.fecha) }, { label: 'Local', get: (a) => store.localName(a.localId) }, { label: 'Categorías', get: (a) => (a.categorias || []).join(', ') }, { label: 'Auditor', key: 'auditor' }, { label: 'Nota', key: 'puntuacion' }, { label: 'Hallazgos', get: (a) => (a.hallazgos || []).length }], rows: done, href: (a) => `#/auditorias/${a.id}` },
    };
  },
  tareas(r) {
    const t = store.all('tareas');
    const open = t.filter((x) => !['Hecha', 'Cancelada'].includes(x.estado));
    const venc = open.filter((x) => isOverdue(x.limite, false));
    const created = t.filter((x) => inR(x.creada, r));
    const byResp = Object.entries(groupBy(open, 'responsable')).sort((a, b) => b[1].length - a[1].length);
    return {
      kpis: [
        { label: 'Abiertas', value: open.length, ic: 'checksq' },
        { label: 'Vencidas', value: venc.length, ic: 'clock', foot: venc.length ? '<span class="down">requieren atención</span>' : 'al día' },
        { label: 'Creadas en el periodo', value: created.length, ic: 'plus' },
        { label: 'Hechas', value: t.filter((x) => x.estado === 'Hecha').length, ic: 'check', foot: 'total' },
      ],
      charts: [
        card('Abiertas por responsable', hbars(byResp.slice(0, 8).map(([p, l]) => ({ label: p, value: l.length, tip: `${p}: ${l.length} abiertas, ${l.filter((x) => isOverdue(x.limite, false)).length} vencidas` })), { color: 'var(--teal)' })),
        card('Abiertas por prioridad', stacked(['Crítica', 'Alta', 'Media', 'Baja'].map((p) => ({ label: p, value: open.filter((x) => x.prioridad === p).length, color: PRIO_C[p] })))),
      ],
      table: { title: 'Tareas abiertas', cols: [{ label: 'Título', key: 'titulo' }, { label: 'Responsable', key: 'responsable' }, { label: 'Prioridad', key: 'prioridad' }, { label: 'Estado', key: 'estado' }, { label: 'Fecha límite', get: (x) => (x.limite ? fmtDate(x.limite) : '') }, { label: 'Vencida', get: (x) => (isOverdue(x.limite, false) ? 'Sí' : 'No') }, { label: 'Local', get: (x) => (x.localId ? store.localName(x.localId) : '') }, { label: 'Proyecto', get: (x) => (x.proyectoId ? store.projectName(x.proyectoId) : '') }], rows: open.sort((a, b) => toDate(a.limite || 8.64e15) - toDate(b.limite || 8.64e15)), href: (x) => `#/tareas/${x.id}` },
    };
  },
  locales(r) {
    const rows = store.all('locales').map((l) => {
      const aud = store.all('auditorias').filter((a) => a.localId === l.id && a.puntuacion != null).sort((a, b) => toDate(b.fecha) - toDate(a.fecha))[0];
      const inc = store.all('incidencias').filter((i) => i.localId === l.id && OPEN_INC(i));
      const vis = store.all('visitas').filter((v) => v.localId === l.id && inR(v.fecha, r));
      const acc = store.all('tareas').filter((t) => t.localId === l.id && !['Hecha', 'Cancelada'].includes(t.estado));
      const riesgo = inc.filter((i) => i.prioridad === 'Crítica').length * 3 + inc.length + (aud && aud.puntuacion < 70 ? 3 : 0) + acc.filter((t) => isOverdue(t.limite, false)).length;
      return { l, nombre: l.nombre, marca: l.marca, estado: l.estado, nota: aud?.puntuacion ?? '', inc: inc.length, vis: vis.length, acc: acc.length, riesgo };
    }).sort((a, b) => b.riesgo - a.riesgo);
    return {
      kpis: [
        { label: 'Locales', value: rows.length, ic: 'store' },
        { label: 'Con incidencias abiertas', value: rows.filter((x) => x.inc).length, ic: 'alert' },
        { label: 'Nota < 70', value: rows.filter((x) => x.nota !== '' && x.nota < 70).length, ic: 'audit' },
        { label: 'Sin visita en el periodo', value: rows.filter((x) => !x.vis && x.estado === 'Abierto').length, ic: 'pin' },
      ],
      charts: [card('Índice de atención', hbars(rows.slice(0, 8).map((x) => ({ label: x.nombre, value: x.riesgo, tip: `${x.nombre}: ${x.inc} incidencias abiertas, nota ${x.nota || '—'}, ${x.acc} acciones abiertas`, color: x.riesgo >= 8 ? 'var(--red)' : x.riesgo >= 4 ? 'var(--amber)' : 'var(--accent)' }))), 'Más alto = necesita más atención')
        + `<p class="xs subtle" style="margin:0 2px">Índice = 3 × incidencias críticas + incidencias abiertas + 3 si la última auditoría baja de 70 + acciones vencidas.</p>`],
      table: { title: 'Locales', cols: [{ label: 'Local', key: 'nombre' }, { label: 'Marca', key: 'marca' }, { label: 'Estado', key: 'estado' }, { label: 'Última nota', key: 'nota' }, { label: 'Incidencias abiertas', key: 'inc' }, { label: 'Visitas periodo', key: 'vis' }, { label: 'Acciones abiertas', key: 'acc' }, { label: 'Índice', key: 'riesgo' }], rows, href: (x) => `#/locales/${x.l.id}` },
    };
  },
  aprobaciones(r) {
    const a = store.all('aprobaciones');
    const per = a.filter((x) => inR(x.creada, r));
    const bySys = Object.entries(groupBy(per, 'sistema'));
    const byState = groupBy(per, 'estado');
    return {
      kpis: [
        { label: 'Pendientes', value: a.filter((x) => x.estado === 'Pendiente').length, ic: 'approve' },
        { label: 'Propuestas en el periodo', value: per.length, ic: 'sparkles' },
        { label: 'Aprobadas', value: per.filter((x) => /Aprobada|En cola/.test(x.estado)).length, ic: 'check' },
        { label: 'Rechazadas', value: (byState['Rechazada'] || []).length, ic: 'x' },
      ],
      charts: [card('Por sistema', hbars(bySys.map(([s, l]) => ({ label: s, value: l.length })), { color: 'var(--purple)' }))],
      table: { title: 'Propuestas', cols: [{ label: 'Fecha', get: (x) => fmtDateTime(x.creada) }, { label: 'Acción', key: 'accion' }, { label: 'Sistema', key: 'sistema' }, { label: 'Estado', key: 'estado' }, { label: 'Origen', key: 'origen' }], rows: per.sort((x, y) => toDate(y.creada) - toDate(x.creada)), href: () => '#/aprobaciones' },
    };
  },
  actividad(r) {
    const act = store.all('actividad').filter((x) => inR(x.fecha, r)).sort((a, b) => toDate(b.fecha) - toDate(a.fecha));
    const byMod = Object.entries(groupBy(act, 'modulo')).sort((a, b) => b[1].length - a[1].length);
    return {
      kpis: [{ label: 'Movimientos', value: act.length, ic: 'history' }, { label: 'Módulos con actividad', value: byMod.length, ic: 'grid' }],
      charts: [card('Movimientos por periodo', bars(series(store.all('actividad'), 'fecha', r), { highlightLast: true })), card('Por módulo', hbars(byMod.map(([m, l]) => ({ label: m, value: l.length }))))],
      table: { title: 'Historial', cols: [{ label: 'Fecha', get: (x) => fmtDateTime(x.fecha) }, { label: 'Módulo', key: 'modulo' }, { label: 'Movimiento', key: 'texto' }], rows: act },
    };
  },
};

const mod = {
  id: 'informes', title: 'Informes', icon: 'chart',
  render(view, params = []) {
    const id = R[params[0]] ? params[0] : 'resumen';
    const rep = REPORTS.find((x) => x.id === id);
    const r = range();
    const data = R[id](r);
    const demo = store.all('locales').some((l) => l.demo);
    const MAX = 50;
    view.innerHTML = `
      ${pageHead('Informes', 'Indicadores calculados con los datos de la app. Exporta a PDF o Excel.', `<button class="btn" data-csv>${icon('download', 'sm')}<span>Excel</span></button><button class="btn primary" data-print>${icon('printer', 'sm')}<span>PDF</span></button>`)}
      ${demo ? demoNotice('<b>Informe con datos de ejemplo.</b> Las cifras no son de Restalia. Se recalcularán solas cuando lleguen los datos de Notion y Microsoft 365.') : ''}
      <div class="chips no-print" style="margin:14px 0 10px;overflow-x:auto;flex-wrap:nowrap;padding-bottom:4px">${REPORTS.map((x) => `<a class="chip ${x.id === id ? 'on' : ''}" href="#/informes/${x.id}" style="white-space:nowrap">${icon(x.ic, 'sm')}${esc(x.label)}</a>`).join('')}</div>
      <div class="toolbar no-print">${seg('period', PERIODS, st.period)}<span class="xs subtle" style="margin-left:auto">${fmtDateFull(r.from)} – ${fmtDateFull(r.to)}</span></div>
      <div class="print-only" style="margin-bottom:12px"><h2 style="margin:0">${esc(rep.label)} · Restalia Operations AI</h2><p class="small">${fmtDateFull(r.from)} – ${fmtDateFull(r.to)} · generado ${fmtDateTime(new Date())}${demo ? ' · DATOS DE EJEMPLO (DEMO)' : ''}</p></div>
      <div class="grid g4 keep2">${data.kpis.map(kpi).join('')}</div>
      <div class="grid g2" style="margin-top:16px">${data.charts.join('')}</div>
      ${data.table ? `<div class="card" style="margin-top:16px"><div class="card-h"><h3>${esc(data.table.title)}</h3><span class="xs subtle">${data.table.rows.length} filas${data.table.rows.length > MAX ? ` · se muestran ${MAX}, Excel incluye todas` : ''}</span></div>
        ${data.table.rows.length ? `<div style="overflow-x:auto"><table class="tbl"><thead><tr>${data.table.cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>
          ${data.table.rows.slice(0, MAX).map((row) => `<tr ${data.table.href ? `data-href="${data.table.href(row)}" style="cursor:pointer"` : ''}>${data.table.cols.map((c) => `<td>${esc(typeof c.get === 'function' ? c.get(row) : row[c.key])}</td>`).join('')}</tr>`).join('')}
        </tbody></table></div>` : empty('Sin datos en el periodo.', 'chart')}</div>` : ''}`;
    bindSeg(view, 'period', (v) => { st.period = v; const fresh = view.cloneNode(false); view.replaceWith(fresh); mod.render(fresh, params); });
    view.querySelector('[data-print]').addEventListener('click', () => window.print());
    view.querySelector('[data-csv]').addEventListener('click', () => {
      if (!data.table?.rows.length) { toast('No hay filas que exportar', 'info'); return; }
      download(`restalia-${id}-${new Date().toISOString().slice(0, 10)}${demo ? '-DEMO' : ''}.csv`, toCSV(data.table.rows, data.table.cols), 'text/csv;charset=utf-8');
      toast('Excel (CSV) descargado', 'download');
    });
  },
};

export default mod;
