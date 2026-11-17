// Lógica de negocio: resúmenes, prioridades y riesgos calculados sobre los datos cargados.
// Es determinista (no es IA): cuando haya proveedor de IA, estos datos se le pasan como contexto.
import * as store from './store.js';
import { isToday, isOverdue, startOfDay, addDays, diffDays, toDate, fmtTime } from './utils.js';

const OPEN_INC = (i) => !['Resuelta', 'Cerrada'].includes(i.estado);
const OPEN_TASK = (t) => t.estado !== 'Hecha';
const PRIO = { 'Crítica': 0, 'Alta': 1, 'Media': 2, 'Baja': 3 };

/** Eventos unificados de agenda: eventos + visitas + auditorías + tareas con fecha + incidencias con límite */
export function agendaItems() {
  const items = store.all('eventos').map((e) => ({ ...e, kind: 'evento', href: null }));
  for (const v of store.all('visitas')) items.push({ id: v.id, titulo: `Visita · ${store.localName(v.localId)}`, tipo: 'visita', inicio: v.fecha, fin: toDate(v.fecha).getTime() + 3600e3, localId: v.localId, ubicacion: store.localName(v.localId), responsable: v.responsable, estado: 'Completado', kind: 'visita', href: `#/visitas/${v.id}`, demo: v.demo });
  for (const v of store.all('visitas').filter((x) => x.seguimiento)) items.push({ id: v.id + '-seg', titulo: `Seguimiento · ${store.localName(v.localId)}`, tipo: 'seguimiento', inicio: v.seguimiento, fin: toDate(v.seguimiento).getTime() + 1800e3, localId: v.localId, ubicacion: store.localName(v.localId), responsable: v.responsable, estado: 'Pendiente', kind: 'visita', href: `#/visitas/${v.id}`, demo: v.demo });
  for (const a of store.all('auditorias').filter((x) => x.estado !== 'Completada')) items.push({ id: a.id, titulo: `Auditoría · ${store.localName(a.localId)}`, tipo: 'auditoria', inicio: a.fecha, fin: toDate(a.fecha).getTime() + 5400e3, localId: a.localId, ubicacion: store.localName(a.localId), responsable: a.auditor, estado: a.estado, kind: 'auditoria', href: `#/auditorias/${a.id}`, demo: a.demo });
  for (const t of store.all('tareas').filter((x) => x.limite && OPEN_TASK(x))) items.push({ id: t.id, titulo: t.titulo, tipo: 'tarea', inicio: t.limite, fin: t.limite, allDay: true, localId: t.localId, ubicacion: t.localId ? store.localName(t.localId) : '', responsable: t.responsable, estado: t.estado, kind: 'tarea', href: `#/tareas/${t.id}`, demo: t.demo });
  for (const i of store.all('incidencias').filter((x) => x.limite && OPEN_INC(x))) items.push({ id: i.id + '-lim', titulo: `Límite ${i.id} · ${i.titulo}`, tipo: 'limite', inicio: i.limite, fin: i.limite, allDay: true, localId: i.localId, ubicacion: store.localName(i.localId), responsable: i.responsable, estado: i.estado, kind: 'incidencia', href: `#/incidencias/${i.id}`, demo: i.demo });
  // evitar duplicar auditorías que ya vienen como evento con el mismo local y día
  const seen = new Set();
  return items.filter((x) => { const k = `${x.tipo}|${x.localId}|${startOfDay(x.inicio).getTime()}`; if (x.kind === 'auditoria' && seen.has(k)) return false; if (x.kind === 'evento') seen.add(k); return true; })
    .sort((a, b) => toDate(a.inicio) - toDate(b.inicio));
}

export function today() {
  const ag = agendaItems().filter((x) => isToday(x.inicio));
  const tareas = store.all('tareas');
  return {
    reuniones: ag.filter((x) => x.tipo === 'reunion'),
    visitas: ag.filter((x) => x.tipo === 'visita'),
    auditorias: ag.filter((x) => x.tipo === 'auditoria'),
    seguimientos: ag.filter((x) => x.tipo === 'seguimiento'),
    agenda: ag.filter((x) => !x.allDay),
    tareasHoy: tareas.filter((t) => OPEN_TASK(t) && t.limite && isToday(t.limite)),
    vencidas: tareas.filter((t) => isOverdue(t.limite, !OPEN_TASK(t))).sort((a, b) => PRIO[a.prioridad] - PRIO[b.prioridad]),
    incAbiertas: store.all('incidencias').filter(OPEN_INC),
  };
}

export function kpis() {
  const since30 = addDays(new Date(), -30);
  const tareas = store.all('tareas');
  return {
    locales: store.all('locales').filter((l) => l.estado !== 'Próxima apertura').length,
    visitas30: store.all('visitas').filter((v) => toDate(v.fecha) >= since30).length,
    audPend: store.all('auditorias').filter((a) => a.estado !== 'Completada').length,
    incAbiertas: store.all('incidencias').filter(OPEN_INC).length,
    incCriticas: store.all('incidencias').filter((i) => OPEN_INC(i) && i.prioridad === 'Crítica').length,
    accPend: tareas.filter(OPEN_TASK).length,
    vencidas: tareas.filter((t) => isOverdue(t.limite, !OPEN_TASK(t))).length,
    aprobPend: store.all('aprobaciones').filter((a) => a.estado === 'Pendiente').length,
  };
}

/** Briefing del día en 6 bloques. Cada línea: {text, href?} */
const n = (v, one, many) => `${v} ${v === 1 ? one : many}`;

export function briefing() {
  const d = today();
  const k = kpis();
  const now = new Date();
  const next = d.agenda.filter((x) => toDate(x.fin || x.inicio) >= now);
  const crit = d.incAbiertas.filter((i) => i.prioridad === 'Crítica');
  const oldCrit = crit.filter((i) => diffDays(now, i.fecha) > 2);
  const auditBad = store.all('auditorias').filter((a) => a.puntuacion != null && a.puntuacion < 70);
  const pendMsgs = store.all('mensajes').filter((m) => m.pendiente && m.importante);
  const resumen = [
    { text: `${n(d.reuniones.length, 'reunión', 'reuniones')}, ${n(d.visitas.length, 'visita', 'visitas')} y ${n(d.auditorias.length, 'auditoría', 'auditorías')} en agenda.`, href: '#/agenda' },
    { text: `${d.tareasHoy.length === 1 ? '1 tarea vence' : `${d.tareasHoy.length} tareas vencen`} hoy y ${d.vencidas.length === 1 ? '1 ya está vencida' : `${d.vencidas.length} ya están vencidas`}.`, href: '#/tareas' },
    { text: `${n(k.incAbiertas, 'incidencia abierta', 'incidencias abiertas')}, ${n(k.incCriticas, 'crítica', 'críticas')}.`, href: '#/incidencias' },
  ];
  const prioridades = [
    ...crit.slice(0, 2).map((i) => ({ text: `Resolver ${i.id}: ${i.titulo} (${store.localName(i.localId)})`, href: `#/incidencias/${i.id}` })),
    ...d.tareasHoy.filter((t) => ['Crítica', 'Alta'].includes(t.prioridad)).slice(0, 2).map((t) => ({ text: `Cerrar hoy: ${t.titulo}`, href: `#/tareas/${t.id}` })),
    ...(k.aprobPend ? [{ text: `Revisar ${k.aprobPend} propuestas en Aprobaciones`, href: '#/aprobaciones' }] : []),
  ].slice(0, 4);
  const compromisos = next.slice(0, 4).map((x) => ({ text: `${fmtTime(x.inicio)} · ${x.titulo}`, href: x.href || '#/agenda' }));
  const riesgos = [
    ...oldCrit.map((i) => ({ text: `${i.id} lleva ${diffDays(now, i.fecha)} días abierta siendo crítica`, href: `#/incidencias/${i.id}` })),
    ...auditBad.slice(0, 2).map((a) => ({ text: `${store.localName(a.localId)} sacó ${a.puntuacion} en su última auditoría`, href: `#/auditorias/${a.id}` })),
    ...pendMsgs.slice(0, 2).map((m) => ({ text: `Sin responder: «${m.asunto}»`, href: `#/comunicaciones/${m.id}` })),
  ].slice(0, 4);
  const atrasadas = d.vencidas.slice(0, 4).map((t) => ({ text: `${t.titulo} · ${t.responsable} · ${-diffDays(t.limite, now)} d`, href: `#/tareas/${t.id}` }));
  const recomendaciones = [];
  if (oldCrit.length) recomendaciones.push({ text: 'Escala las incidencias críticas antiguas o asigna una fecha de cierre realista.', href: '#/incidencias' });
  if (d.vencidas.length > 3) recomendaciones.push({ text: 'Reprograma las tareas vencidas de baja prioridad para liberar el día.', href: '#/tareas' });
  if (auditBad.length) recomendaciones.push({ text: `Programa una visita de seguimiento a ${store.localName(auditBad[0].localId)}.`, href: '#/visitas/nueva' });
  if (pendMsgs.length) recomendaciones.push({ text: 'Prepara respuestas a los mensajes importantes y envíalas a aprobación.', href: '#/comunicaciones' });
  if (!recomendaciones.length) recomendaciones.push({ text: 'Día despejado: buen momento para una visita sin aviso.', href: '#/visitas/nueva' });
  return { resumen, prioridades, compromisos, riesgos, atrasadas, recomendaciones };
}
