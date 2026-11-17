// Mi asistente IA. Sin proveedor conectado responde un motor local que solo usa los datos cargados
// en la app (DEMO) y lo dice en cada respuesta. Con backend + proveedor, usa aiAdapter.chat.
import * as store from '../core/store.js';
import { icon, badge, empty, field, readForm, openSheet, confirmSheet, toast, on } from '../core/ui.js';
import { esc, norm, fmtTime, fmtDate, fmtDateTime, relTime, addDays, toDate, isOverdue, isToday, diffDays, groupBy } from '../core/utils.js';
import { today, kpis, briefing, agendaItems } from '../core/insights.js';
import { aiAdapter } from '../adapters/ai.js';

const SUGGESTIONS = [
  { q: 'Organiza mi jornada', ic: 'sun' },
  { q: 'Resume mis correos', ic: 'mail' },
  { q: '¿Qué tengo pendiente?', ic: 'checksq' },
  { q: 'Prepara mi próxima reunión', ic: 'users' },
  { q: 'Analiza las incidencias', ic: 'alert' },
  { q: 'Resume la actividad semanal', ic: 'trend' },
  { q: 'Busca un procedimiento de limpieza', ic: 'search' },
  { q: 'Prepara un informe de visitas', ic: 'chart' },
];
const OPEN_TASK = (t) => t.estado !== 'Hecha';
const OPEN_INC = (i) => !['Resuelta', 'Cerrada'].includes(i.estado);
const PRIO = { 'Crítica': 0, 'Alta': 1, 'Media': 2, 'Baja': 3 };
const L = (text, href) => ({ text, href });

let currentId = null;
let projectFilter = '';

// ---------- Motor local ----------
function hasDemo() { return store.all('locales').some((l) => l.demo); }
function srcLine(extra = '') {
  return `Motor local · sin IA conectada · ${hasDemo() ? 'datos DEMO de la app' : 'datos guardados en este dispositivo'}${extra ? ` · ${extra}` : ''}`;
}

const intents = [
  { id: 'remember', test: (n) => /^(recuerda|acuerdate|apunta en tu memoria)/.test(n), run: remember },
  { id: 'adjunto', test: (n, ctx) => ctx.attachments.length > 0 || /\badjunt/.test(n), run: attachmentAnswer },
  { id: 'jornada', test: (n) => /jornada|organiza|mi dia|que tengo hoy|agenda de hoy|briefing/.test(n), run: jornada },
  { id: 'correos', test: (n) => /correo|mail|mensaje|teams|outlook|bandeja/.test(n), run: correos },
  { id: 'reunion', test: (n) => /reunion/.test(n), run: reunion },
  { id: 'incidencias', test: (n) => /incidencia/.test(n), run: incidencias },
  { id: 'semanal', test: (n) => /semana|actividad/.test(n), run: semanal },
  { id: 'informe', test: (n) => /informe|visitas/.test(n), run: informeVisitas },
  { id: 'procedimiento', test: (n) => /procedimiento|busca|documento|manual|protocolo/.test(n), run: procedimiento },
  { id: 'pendiente', test: (n) => /pendiente|tareas|atrasad|vencid|que tengo/.test(n), run: pendiente },
];

function localAnswer(text, ctx) {
  const n = norm(text);
  const it = intents.find((i) => i.test(n, ctx));
  return it ? it.run(text, n, ctx) : fallback();
}

function remember(text) {
  const fact = text.replace(/^\s*(recuerda( que)?|acuérdate( de que)?|apunta en tu memoria( que)?)\s*/i, '').trim();
  if (!fact) return { title: 'Memoria de trabajo', sections: [{ h: '¿Qué quieres que recuerde?', p: 'Escribe por ejemplo: «Recuerda que los lunes reviso las incidencias críticas».' }], src: srcLine() };
  store.ai.remember(fact);
  return { title: 'Lo tendré en cuenta', sections: [{ h: 'Guardado en la memoria de trabajo', items: [L(fact)] }, { p: 'La memoria se guarda solo en este dispositivo. Puedes revisarla o borrarla desde el botón Memoria.' }], src: srcLine() };
}

function jornada() {
  const d = today();
  const b = briefing();
  const now = new Date();
  const pend = d.agenda.filter((x) => toDate(x.fin || x.inicio) >= now);
  const mem = store.ai.memory().slice(0, 3);
  const top = [...d.vencidas, ...d.tareasHoy.filter((t) => !d.vencidas.includes(t))].sort((a, c) => PRIO[a.prioridad] - PRIO[c.prioridad]).slice(0, 3);
  const actions = [];
  if (top[0]) actions.push({ label: `Marcar en curso: ${top[0].titulo}`.slice(0, 60), kind: 'taskState', id: top[0].id, estado: 'En curso' });
  actions.push({ label: 'Abrir agenda de hoy', kind: 'nav', href: '#/agenda/dia' });
  return {
    title: 'Tu jornada de hoy',
    sections: [
      { h: 'Resumen', items: b.resumen },
      { h: 'Lo que queda en agenda', items: pend.length ? pend.map((x) => L(`${fmtTime(x.inicio)}–${fmtTime(x.fin)} · ${x.titulo}${x.ubicacion ? ` (${x.ubicacion})` : ''}`, x.href || '#/agenda/dia')) : [L('No quedan compromisos con hora hoy.')] },
      { h: 'Propuesta de orden', ol: true, items: [
        ...(d.incAbiertas.some((i) => i.prioridad === 'Crítica') ? [L('Primero, 15 minutos para las incidencias críticas abiertas.', '#/incidencias')] : []),
        ...top.map((t) => L(`${t.titulo} (${t.prioridad}${isOverdue(t.limite, false) ? ', vencida' : ''})`, `#/tareas/${t.id}`)),
        ...(store.all('aprobaciones').some((a) => a.estado === 'Pendiente') ? [L('Antes de cerrar el día, revisa la bandeja de aprobaciones.', '#/aprobaciones')] : []),
      ] },
      ...(b.riesgos.length ? [{ h: 'Riesgos', items: b.riesgos }] : []),
      ...(mem.length ? [{ h: 'De tu memoria de trabajo', items: mem.map((m) => L(m.text)) }] : []),
    ],
    actions, src: srcLine('agenda, tareas e incidencias'),
  };
}

function correos() {
  const msgs = store.all('mensajes').slice().sort((a, b) => toDate(b.fecha) - toDate(a.fecha));
  const pend = msgs.filter((m) => m.pendiente);
  const imp = pend.filter((m) => m.importante);
  const tareas = msgs.flatMap((m) => (m.tareasDetectadas || []).filter((t) => !(m.tareasCreadas || []).includes(t)).map((t) => ({ t, m })));
  const actions = imp[0] ? [{ label: `Preparar respuesta a «${imp[0].asunto}»`.slice(0, 60), kind: 'nav', href: `#/comunicaciones/${imp[0].id}` }] : [];
  if (tareas[0]) actions.push({ label: `Crear tarea: ${tareas[0].t}`.slice(0, 60), kind: 'task', task: { titulo: tareas[0].t, localId: tareas[0].m.localId, origenRef: tareas[0].m.id, descripcion: `Detectada en «${tareas[0].m.asunto}»` }, msgId: tareas[0].m.id });
  return {
    title: 'Resumen de correos y mensajes',
    note: 'Outlook y Teams no están conectados: resumo los mensajes de ejemplo cargados en la app.',
    sections: [
      { h: 'En cifras', items: [L(`${msgs.length} mensajes, ${pend.length} pendientes de respuesta, ${imp.length} importantes.`, '#/comunicaciones')] },
      { h: 'Importantes sin responder', items: imp.length ? imp.map((m) => L(`${m.de}: ${m.asunto} · ${relTime(m.fecha)}`, `#/comunicaciones/${m.id}`)) : [L('Ninguno.')] },
      { h: 'Compromisos detectados', items: msgs.flatMap((m) => (m.compromisos || []).map((c) => L(`${c} (${m.de})`, `#/comunicaciones/${m.id}`))).slice(0, 5) },
      { h: 'Posibles tareas', items: tareas.slice(0, 5).map(({ t, m }) => L(`${t} · de «${m.asunto}»`, `#/comunicaciones/${m.id}`)) },
    ],
    actions, src: srcLine('mensajes'),
  };
}

function pendiente() {
  const t = store.all('tareas').filter(OPEN_TASK).sort((a, b) => (toDate(a.limite || 8.64e15) - toDate(b.limite || 8.64e15)) || PRIO[a.prioridad] - PRIO[b.prioridad]);
  const venc = t.filter((x) => isOverdue(x.limite, false));
  const mias = t.filter((x) => x.responsable === 'Alberto');
  const apr = store.all('aprobaciones').filter((a) => a.estado === 'Pendiente');
  const actions = [{ label: 'Ver mis tareas', kind: 'nav', href: '#/tareas' }];
  if (apr.length) actions.push({ label: `Revisar ${apr.length} aprobaciones`, kind: 'nav', href: '#/aprobaciones' });
  return {
    title: 'Lo que tienes pendiente',
    sections: [
      { h: 'En cifras', items: [L(`${t.length} tareas abiertas (${mias.length} tuyas), ${venc.length} vencidas, ${apr.length} aprobaciones esperando.`)] },
      { h: 'Vencidas', items: venc.length ? venc.slice(0, 6).map((x) => L(`${x.titulo} · ${x.responsable} · hace ${-diffDays(x.limite, new Date())} d`, `#/tareas/${x.id}`)) : [L('Ninguna. Vas al día.')] },
      { h: 'Próximas', items: t.filter((x) => !venc.includes(x)).slice(0, 6).map((x) => L(`${x.titulo} · ${x.limite ? fmtDate(x.limite) : 'sin fecha'} · ${x.prioridad}`, `#/tareas/${x.id}`)) },
      ...(apr.length ? [{ h: 'Esperando tu aprobación', items: apr.map((a) => L(`${a.accion} (${a.sistema})`, '#/aprobaciones')) }] : []),
    ],
    actions, src: srcLine('tareas y aprobaciones'),
  };
}

function reunion() {
  const now = new Date();
  const next = agendaItems().filter((x) => x.tipo === 'reunion' && toDate(x.fin || x.inicio) >= now).sort((a, b) => toDate(a.inicio) - toDate(b.inicio))[0];
  if (!next) return { title: 'Próxima reunión', sections: [{ p: 'No hay reuniones próximas en la agenda.' }], actions: [{ label: 'Abrir agenda', kind: 'nav', href: '#/agenda' }], src: srcLine('agenda') };
  const loc = next.localId ? store.find('locales', next.localId) : null;
  const ctxItems = [];
  if (loc) {
    const inc = store.all('incidencias').filter((i) => i.localId === loc.id && OPEN_INC(i));
    const vis = store.all('visitas').filter((v) => v.localId === loc.id).sort((a, b) => toDate(b.fecha) - toDate(a.fecha))[0];
    const aud = store.all('auditorias').filter((a) => a.localId === loc.id && a.puntuacion != null).sort((a, b) => toDate(b.fecha) - toDate(a.fecha))[0];
    ctxItems.push(L(`${inc.length} incidencias abiertas en ${loc.nombre}`, `#/locales/${loc.id}`));
    if (vis) ctxItems.push(L(`Última visita: ${fmtDate(vis.fecha)} · ${vis.resultado}`, `#/visitas/${vis.id}`));
    if (aud) ctxItems.push(L(`Última auditoría: ${aud.puntuacion} puntos`, `#/auditorias/${aud.id}`));
  }
  const kw = norm(next.titulo).split(/\W+/).filter((w) => w.length > 4);
  const docs = store.all('documentos').filter((d) => kw.some((w) => norm(d.titulo).includes(w))).slice(0, 3);
  return {
    title: `Preparar: ${next.titulo}`,
    sections: [
      { h: 'Datos', items: [L(`${fmtDateTime(next.inicio)} – ${fmtTime(next.fin)}`), L(next.ubicacion || 'Sin ubicación'), ...(next.asistentes?.length ? [L(`Asistentes: ${next.asistentes.join(', ')}`)] : [])] },
      ...(ctxItems.length ? [{ h: 'Contexto del local', items: ctxItems }] : []),
      ...(docs.length ? [{ h: 'Documentos relacionados', items: docs.map((d) => L(d.titulo, `#/documentacion/${d.id}`)) }] : []),
      { h: 'Guion sugerido', ol: true, items: [L('Repasar acuerdos y tareas abiertas de la reunión anterior.'), L('Revisar incidencias y riesgos que afectan al tema.'), L('Decidir responsables y fechas para cada acción.'), L('Cerrar con resumen y próximos pasos.')] },
    ],
    actions: [{ label: 'Crear tarea de preparación', kind: 'task', task: { titulo: `Preparar ${next.titulo}`.slice(0, 120), localId: next.localId || null, limite: toDate(next.inicio).toISOString(), prioridad: 'Alta' } }, { label: 'Ver en agenda', kind: 'nav', href: '#/agenda' }],
    src: srcLine('agenda, locales y documentación'),
  };
}

function incidencias() {
  const open = store.all('incidencias').filter(OPEN_INC);
  const byPrio = groupBy(open, 'prioridad');
  const byLoc = Object.entries(groupBy(open, 'localId')).sort((a, b) => b[1].length - a[1].length);
  const byCat = Object.entries(groupBy(open, 'categoria')).sort((a, b) => b[1].length - a[1].length);
  const old = open.slice().sort((a, b) => toDate(a.fecha) - toDate(b.fecha)).slice(0, 3);
  const crit = (byPrio['Crítica'] || [])[0];
  return {
    title: 'Análisis de incidencias',
    sections: [
      { h: 'Situación', items: [L(`${open.length} abiertas: ${['Crítica', 'Alta', 'Media', 'Baja'].map((p) => { const c = (byPrio[p] || []).length; return `${c} ${p.toLowerCase()}${c === 1 ? '' : 's'}`; }).join(', ')}.`, '#/incidencias')] },
      { h: 'Locales con más incidencias', items: byLoc.slice(0, 4).map(([id, l]) => L(`${store.localName(id)}: ${l.length}`, `#/locales/${id}`)) },
      { h: 'Categorías más repetidas', items: byCat.slice(0, 4).map(([c, l]) => L(`${c}: ${l.length}`)) },
      { h: 'Las más antiguas', items: old.map((i) => L(`${i.id} · ${i.titulo} · ${diffDays(new Date(), i.fecha)} días`, `#/incidencias/${i.id}`)) },
      { h: 'Recomendación', p: byCat[0] ? `Hay un patrón en «${byCat[0][0]}». Conviene revisar el procedimiento y planificar una auditoría centrada en esa categoría en ${store.localName(byLoc[0]?.[0])}.` : 'Sin patrones destacables.' },
    ],
    actions: crit ? [{ label: `Crear tarea para escalar ${crit.id}`, kind: 'task', task: { titulo: `Escalar ${crit.id}: ${crit.titulo}`.slice(0, 120), localId: crit.localId, origenRef: crit.id, prioridad: 'Crítica', limite: addDays(new Date(), 1).toISOString() } }] : [],
    src: srcLine('incidencias'),
  };
}

function semanal() {
  const since = addDays(new Date(), -7);
  const in7 = (r, f) => toDate(r[f]) >= since && toDate(r[f]) <= new Date();
  const vis = store.all('visitas').filter((v) => in7(v, 'fecha'));
  const inc = store.all('incidencias').filter((i) => in7(i, 'fecha'));
  const aud = store.all('auditorias').filter((a) => a.estado === 'Completada' && in7(a, 'fecha'));
  const done = store.all('tareas').filter((t) => t.estado === 'Hecha' && in7(t, 'updatedAt' in t ? 'updatedAt' : 'creada'));
  const act = store.all('actividad').filter((a) => in7(a, 'fecha')).sort((a, b) => toDate(b.fecha) - toDate(a.fecha));
  return {
    title: 'Actividad de los últimos 7 días',
    sections: [
      { h: 'En cifras', items: [L(`${vis.length} visitas realizadas`, '#/visitas'), L(`${inc.length} incidencias nuevas`, '#/incidencias'), L(`${aud.length} auditorías completadas${aud.length ? ` (media ${Math.round(aud.reduce((s, a) => s + a.puntuacion, 0) / aud.length)})` : ''}`, '#/auditorias'), L(`${done.length} tareas cerradas`, '#/tareas')] },
      { h: 'Movimientos destacados', items: act.slice(0, 6).map((a) => L(`${a.texto} · ${relTime(a.fecha)}`, `#/${a.modulo}`)) },
    ],
    actions: [{ label: 'Abrir informes', kind: 'nav', href: '#/informes' }],
    src: srcLine('visitas, incidencias, auditorías y tareas'),
  };
}

function informeVisitas() {
  const since = addDays(new Date(), -30);
  const vis = store.all('visitas').filter((v) => toDate(v.fecha) >= since).sort((a, b) => toDate(b.fecha) - toDate(a.fecha));
  const byRes = groupBy(vis, 'resultado');
  const sinVisita = store.all('locales').filter((l) => l.estado === 'Abierto' && !vis.some((v) => v.localId === l.id));
  return {
    title: 'Informe de visitas · 30 días',
    sections: [
      { h: 'Resultado', items: [L(`${vis.length} visitas: ${Object.entries(byRes).map(([r, l]) => `${l.length} ${r.toLowerCase()}${l.length === 1 || r === 'Con incidencias' ? '' : 's'}`).join(', ') || 'ninguna'}.`)] },
      { h: 'Visitas', items: vis.slice(0, 8).map((v) => L(`${fmtDate(v.fecha)} · ${store.localName(v.localId)} · ${v.resultado}`, `#/visitas/${v.id}`)) },
      { h: 'Locales abiertos sin visita este mes', items: sinVisita.length ? sinVisita.map((l) => L(l.nombre, `#/locales/${l.id}`)) : [L('Todos visitados.')] },
    ],
    actions: [{ label: 'Abrir informe completo', kind: 'nav', href: '#/informes/visitas' }, ...(sinVisita[0] ? [{ label: `Planificar visita a ${sinVisita[0].nombre}`.slice(0, 60), kind: 'nav', href: '#/visitas/nueva' }] : [])],
    src: srcLine('visitas y locales'),
  };
}

function procedimiento(text, n) {
  const stop = new Set(['busca', 'buscar', 'un', 'una', 'el', 'la', 'los', 'las', 'de', 'del', 'para', 'procedimiento', 'procedimientos', 'documento', 'manual', 'protocolo', 'sobre', 'me', 'el', 'en']);
  const words = n.split(/\W+/).filter((w) => w.length > 2 && !stop.has(w));
  const docs = store.all('documentos').map((d) => ({ d, s: words.reduce((s, w) => s + (norm(`${d.titulo} ${d.resumen} ${d.area}`).includes(w) ? 1 : 0), 0) }))
    .filter((x) => !words.length || x.s > 0).sort((a, b) => b.s - a.s).slice(0, 6);
  return {
    title: words.length ? `Documentos sobre «${words.join(' ')}»` : 'Buscar un procedimiento',
    note: 'SharePoint y OneDrive no están conectados: busco en el índice de documentos de ejemplo.',
    sections: [{ h: docs.length ? `${docs.length} ${docs.length === 1 ? 'resultado' : 'resultados'}` : 'Sin resultados', items: docs.map(({ d }) => L(`${d.titulo} · ${d.area} · ${d.tipo}`, `#/documentacion/${d.id}`)) },
      ...(!words.length ? [{ p: 'Dime qué buscas, por ejemplo: «Busca el procedimiento de alérgenos».' }] : [])],
    actions: [{ label: 'Abrir Documentación', kind: 'nav', href: '#/documentacion' }],
    src: srcLine('documentación'),
  };
}

function attachmentAnswer(text, n, ctx) {
  const items = ctx.attachments.map((a) => {
    if (a.text != null) {
      const words = a.text.split(/\s+/).filter(Boolean).length;
      const lines = a.text.split(/\n/).filter((l) => l.trim());
      return { h: a.name, items: [L(`${lines.length} líneas · ${words} palabras`), ...lines.slice(0, 5).map((l) => L(l.slice(0, 160)))] };
    }
    return { h: a.name, p: `${a.type || 'Archivo'} de ${Math.round(a.size / 1024)} KB. Para analizar su contenido (PDF, Word, imágenes) hace falta conectar un proveedor de IA desde el backend.` };
  });
  return { title: ctx.attachments.length ? 'Adjuntos recibidos' : 'Adjuntos', note: 'El motor local solo lee texto plano. Los adjuntos no salen de este dispositivo.', sections: items.length ? items : [{ p: 'Pulsa el clip para adjuntar un archivo.' }], src: srcLine() };
}

function fallback() {
  return {
    title: 'Puedo ayudarte con esto',
    note: 'Todavía no hay un proveedor de IA conectado. Respondo con un motor local que entiende peticiones concretas sobre los datos de la app.',
    sections: [{ h: 'Prueba a pedirme', items: SUGGESTIONS.map((s) => L(s.q)) }, { p: 'También puedo recordar cosas: «Recuerda que…».' }],
    src: srcLine(),
  };
}

// ---------- Render de respuestas ----------
function renderAnswer(a, mi) {
  const li = (x) => `<li>${x.href ? `<a href="${esc(x.href)}">${esc(x.text)}</a>` : esc(x.text)}</li>`;
  return `<div class="answer">
    ${a.title ? `<h4 style="font-size:15px">${esc(a.title)}</h4>` : ''}
    ${a.note ? `<div class="notice demo" style="margin:6px 0 10px">${icon('info')}<div>${esc(a.note)}</div></div>` : ''}
    ${(a.sections || []).map((s) => `${s.h ? `<h4>${esc(s.h)}</h4>` : ''}${s.p ? `<p style="margin:4px 0">${esc(s.p)}</p>` : ''}${s.items?.length ? `<${s.ol ? 'ol' : 'ul'}>${s.items.map(li).join('')}</${s.ol ? 'ol' : 'ul'}>` : ''}`).join('')}
    ${a.actions?.length ? `<div class="actions">${a.actions.map((x, i) => x.done ? `<span class="badge green">${icon('check', 'sm')}${esc(x.done)}</span>` : `<button class="btn sm ${x.kind === 'nav' ? '' : 'primary'}" data-act="${mi}:${i}">${icon(x.kind === 'nav' ? 'right' : x.kind === 'task' ? 'plus' : 'check', 'sm')}${esc(x.label)}</button>`).join('')}</div>` : ''}
    ${a.src ? `<div class="src">${icon(a.remote ? 'sparkles' : 'info', 'sm')}${esc(a.src)}</div>` : ''}
  </div>`;
}

function messageHTML(m, i) {
  if (m.role === 'user') {
    return `<div class="msg user"><div class="bubble">${(m.attachments || []).map((a) => `<span class="attach-pill" style="background:rgba(255,255,255,.18);color:#fff">${icon('clip', 'sm')}${esc(a.name)}</span>`).join('')}${m.text ? `<div style="white-space:pre-wrap">${esc(m.text)}</div>` : ''}</div></div>`;
  }
  return `<div class="msg ai"><span class="ai-av">${icon('sparkles')}</span><div class="bubble">${m.pending ? '<span class="subtle">Pensando…</span>' : renderAnswer(m.answer || { sections: [{ p: m.text || '' }] }, i)}</div></div>`;
}

// ---------- Acciones con confirmación ----------
async function runAction(conv, mi, ai) {
  const msg = conv.messages[mi];
  const act = msg?.answer?.actions?.[ai];
  if (!act || act.done) return false;
  if (act.kind === 'nav') { location.hash = act.href; return false; }
  if (act.kind === 'task') {
    const t = act.task;
    const ok = await confirmSheet({ title: 'Crear tarea', text: `Se creará en esta app la tarea «${t.titulo}»${t.localId ? ` para ${store.localName(t.localId)}` : ''}. No se escribe nada en Notion.`, confirm: 'Crear tarea' });
    if (!ok) return false;
    const rec = store.add('tareas', { titulo: t.titulo, descripcion: t.descripcion || 'Propuesta por el asistente', responsable: 'Alberto', prioridad: t.prioridad || 'Media', estado: 'Pendiente', creada: new Date().toISOString(), limite: t.limite || addDays(new Date(), 3).toISOString(), proyectoId: conv.projectId || null, localId: t.localId || null, evidencias: [], ...(t.origenRef ? { origenRef: t.origenRef } : {}) }, { prefix: 'tsk' });
    if (act.msgId) { const m = store.find('mensajes', act.msgId); if (m) store.update('mensajes', m.id, { tareasCreadas: [...(m.tareasCreadas || []), t.titulo] }); }
    store.log(`El asistente creó la tarea «${t.titulo}» con tu confirmación`, 'tareas');
    act.done = 'Tarea creada'; act.ref = rec.id;
  } else if (act.kind === 'taskState') {
    const t = store.find('tareas', act.id);
    if (!t) return false;
    const ok = await confirmSheet({ title: 'Cambiar estado', text: `«${t.titulo}» pasará a «${act.estado}».`, confirm: 'Confirmar' });
    if (!ok) return false;
    store.update('tareas', t.id, { estado: act.estado });
    store.log(`Tarea «${t.titulo}» pasó a ${act.estado}`, 'tareas');
    act.done = `Marcada ${act.estado.toLowerCase()}`;
  }
  store.ai.update(conv.id, { messages: conv.messages });
  toast(act.done);
  return true;
}

// ---------- Vista ----------
function convTitle(text) { const t = text.replace(/\s+/g, ' ').trim(); return t.length > 42 ? `${t.slice(0, 40)}…` : t || 'Nueva conversación'; }

function convListHTML() {
  const convs = store.ai.conversations().filter((c) => !projectFilter || (projectFilter === '_none' ? !c.projectId : c.projectId === projectFilter));
  if (!convs.length) return `<p class="xs subtle" style="padding:8px 10px">Sin conversaciones todavía.</p>`;
  return convs.map((c) => `<div class="conv ${c.id === currentId ? 'on' : ''}" data-conv="${c.id}" role="button" tabindex="0">${icon(c.projectId ? 'folder' : 'chat', 'sm')}<span>${esc(c.title)}</span>${c.projectId ? `<em class="xs subtle" style="font-style:normal;max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(store.projectName(c.projectId))}</em>` : ''}</div>`).join('');
}

function projectSelect(name, value, all = true) {
  const opts = [...(all ? [{ value: '', label: 'Todos los proyectos' }] : []), { value: all ? '_none' : '', label: 'Sin proyecto' }, ...store.all('proyectos').map((p) => ({ value: p.id, label: p.nombre }))];
  return `<select class="sel" name="${name}" data-${name} aria-label="Proyecto" style="width:100%">${opts.map((o) => `<option value="${o.value}" ${o.value === value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
}

function newConversationSheet(onCreated) {
  openSheet({
    title: 'Nueva conversación',
    body: `<form class="form">${field({ label: 'Título', name: 'title', placeholder: 'Opcional' })}<div class="field"><label>Proyecto</label>${projectSelect('projectId', '', false)}</div></form>`,
    footer: '<button class="btn" data-close>Cancelar</button><button class="btn primary" data-ok>Crear</button>',
    onMount(el, close) {
      el.querySelector('[data-ok]').addEventListener('click', () => {
        const d = readForm(el.querySelector('form'));
        const c = store.ai.create(d.title || 'Nueva conversación', d.projectId || null);
        close(); onCreated(c);
      });
    },
  });
}

function memorySheet() {
  openSheet({
    title: 'Memoria de trabajo',
    body: `<p class="small subtle" style="margin-top:0">Lo que el asistente tiene en cuenta en tus conversaciones. Se guarda solo en este dispositivo.</p>
      <form class="row" data-memform style="gap:8px;margin-bottom:12px"><input class="input" name="m" placeholder="Ej.: Los lunes reviso incidencias críticas" style="flex:1"><button class="btn primary">Añadir</button></form>
      <div class="list" data-memlist></div>`,
    onMount(el) {
      const paint = () => {
        const m = store.ai.memory();
        el.querySelector('[data-memlist]').innerHTML = m.length ? m.map((x) => `<div class="li"><span class="li-icon">${icon('brain', 'sm')}</span><div class="li-main"><div class="li-title" style="white-space:normal">${esc(x.text)}</div><div class="li-sub">${relTime(x.at)}</div></div><button class="btn ghost icon sm" data-forget="${x.id}" aria-label="Olvidar">${icon('trash', 'sm')}</button></div>`).join('') : empty('La memoria está vacía.', 'brain');
      };
      el.querySelector('[data-memform]').addEventListener('submit', (e) => { e.preventDefault(); const v = e.target.m.value.trim(); if (!v) return; store.ai.remember(v); e.target.reset(); paint(); });
      on(el, 'click', '[data-forget]', (e, b) => { store.ai.forget(b.dataset.forget); paint(); toast('Olvidado'); });
      paint();
    },
  });
}

export default {
  id: 'asistente', title: 'Mi asistente IA', icon: 'sparkles',
  render(view, params = []) {
    if (params[0] && store.ai.get(params[0])) currentId = params[0];
    else if (params[0] === 'nueva') currentId = null;
    else if (currentId && !store.ai.get(currentId)) currentId = null;
    let attachments = [];
    let busy = false;
    const remote = aiAdapter.isRemote();

    view.innerHTML = `
      <div class="chat">
        <aside class="chat-side">
          <button class="btn primary" style="width:100%;justify-content:center" data-new>${icon('plus', 'sm')}Nueva conversación</button>
          <div style="margin:12px 0 6px">${projectSelect('filter', projectFilter)}</div>
          <div data-convs></div>
          <div style="border-top:1px solid var(--border);margin-top:12px;padding-top:10px">
            <button class="btn ghost sm" style="width:100%;justify-content:flex-start" data-memory>${icon('brain', 'sm')}Memoria de trabajo <span class="subtle" data-memcount style="margin-left:auto"></span></button>
          </div>
        </aside>
        <section class="chat-main">
          <div class="row" style="gap:8px;padding:10px 16px;border-bottom:1px solid var(--border);min-height:52px">
            <button class="btn ghost icon sm m-only" data-history aria-label="Conversaciones">${icon('history')}</button>
            <div style="flex:1;min-width:0"><div data-title style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
              <div class="xs subtle">${remote ? 'IA conectada vía backend' : 'Demostración · sin IA'}</div></div>
            <span class="d-only">${remote ? badge('IA conectada', 'green') : `<a class="badge off" href="#/configuracion" title="Configura un proveedor en el backend">${icon('plug', 'sm')}Sin IA</a>`}</span>
            <button class="btn ghost icon sm m-only" data-memory aria-label="Memoria de trabajo">${icon('brain')}</button>
            <button class="btn ghost icon sm m-only" data-new aria-label="Nueva conversación">${icon('plus')}</button>
            <button class="btn ghost icon sm" data-delconv aria-label="Borrar conversación" hidden>${icon('trash')}</button>
          </div>
          <div class="chat-scroll"><div class="chat-inner" data-msgs></div></div>
          <form class="composer" data-composer>
            <div class="composer-box">
              <div data-attachments></div>
              <textarea rows="1" name="q" placeholder="Pregunta o pide algo…" aria-label="Mensaje para el asistente" enterkeyhint="send"></textarea>
              <div class="bar">
                <label class="btn ghost icon sm" title="Adjuntar archivo" aria-label="Adjuntar archivo" style="cursor:pointer">${icon('clip')}<input type="file" multiple hidden data-file></label>
                <button type="button" class="btn ghost icon sm" data-mic aria-label="Dictar por voz" title="Dictar por voz">${icon('mic')}</button>
                <span class="xs subtle" style="margin-left:auto;margin-right:6px" data-hint></span>
                <button class="btn primary icon sm" type="submit" aria-label="Enviar" data-send>${icon('arrowup')}</button>
              </div>
            </div>
          </form>
        </section>
      </div>`;

    const $ = (s) => view.querySelector(s);
    const msgsEl = $('[data-msgs]');
    const ta = $('textarea');
    const scroller = $('.chat-scroll');

    function paintSide() {
      $('[data-convs]').innerHTML = convListHTML();
      $('[data-memcount]').textContent = store.ai.memory().length || '';
    }
    function paint() {
      const conv = currentId && store.ai.get(currentId);
      $('[data-title]').textContent = conv ? `${conv.title}${conv.projectId ? ` · ${store.projectName(conv.projectId)}` : ''}` : 'Nueva conversación';
      $('[data-delconv]').hidden = !conv;
      if (!conv || !conv.messages.length) {
        msgsEl.innerHTML = `
          <div style="text-align:center;margin:8px 0 4px"><span class="ai-av" style="width:44px;height:44px;border-radius:12px;margin:0 auto">${icon('sparkles')}</span>
          <h2 style="margin:12px 0 4px">¿En qué te ayudo, ${esc(store.getSettings().userName || 'Alberto')}?</h2>
          <p class="small subtle" style="margin:0 auto;max-width:460px">${remote ? 'Respondo con el proveedor de IA configurado y los datos que autorices.' : 'Aún no hay IA conectada. Respondo con un motor local que solo usa los datos de la app, que ahora son de ejemplo.'}</p></div>
          <div class="suggest">${SUGGESTIONS.map((s) => `<button type="button" data-suggest="${esc(s.q)}">${icon(s.ic, 'sm')}<span>${esc(s.q)}</span></button>`).join('')}</div>`;
      } else {
        msgsEl.innerHTML = conv.messages.map(messageHTML).join('');
      }
      paintSide();
      requestAnimationFrame(() => { scroller.scrollTop = conv && conv.messages.length ? scroller.scrollHeight : 0; });
    }
    function paintAttachments() {
      $('[data-attachments]').innerHTML = attachments.map((a, i) => `<span class="attach-pill">${icon('clip', 'sm')}${esc(a.name)}<button type="button" class="btn ghost icon sm" style="width:20px;height:20px" data-unattach="${i}" aria-label="Quitar ${esc(a.name)}">${icon('x', 'sm')}</button></span>`).join('');
    }

    async function send(text) {
      text = (text || '').trim();
      if ((!text && !attachments.length) || busy) return;
      busy = true;
      let conv = currentId && store.ai.get(currentId);
      if (!conv) { conv = store.ai.create(convTitle(text || attachments[0].name), projectFilter && projectFilter !== '_none' ? projectFilter : null); currentId = conv.id; history.replaceState(null, '', `#/asistente/${conv.id}`); }
      else if (conv.title === 'Nueva conversación' && !conv.messages.length) store.ai.update(conv.id, { title: convTitle(text) });
      const att = attachments; attachments = []; paintAttachments();
      store.ai.push(conv.id, { role: 'user', text, attachments: att.map(({ name, size, type }) => ({ name, size, type })) });
      ta.value = ''; ta.style.height = '';
      paint();
      msgsEl.insertAdjacentHTML('beforeend', messageHTML({ role: 'ai', pending: true }));
      scroller.scrollTop = scroller.scrollHeight;
      let answer;
      if (remote) {
        try {
          const r = await aiAdapter.chat(conv.messages.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text || m.answer?.title || '' })), { memory: store.ai.memory().map((m) => m.text), projectId: conv.projectId });
          answer = { sections: [{ p: r.content }], actions: (r.actions || []).filter((a) => ['task', 'nav'].includes(a.kind)), src: `${store.getSettings().aiProvider} vía backend`, remote: true };
        } catch (e) {
          answer = { ...localAnswer(text, { attachments: att }), note: `El proveedor de IA no respondió (${e.message}). Respuesta del motor local.` };
        }
      } else {
        await new Promise((r) => setTimeout(r, 350));
        answer = localAnswer(text, { attachments: att });
      }
      store.ai.push(conv.id, { role: 'ai', answer });
      busy = false;
      paint();
    }

    // Eventos
    $('[data-composer]').addEventListener('submit', (e) => { e.preventDefault(); send(ta.value); });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer:fine)').matches) { e.preventDefault(); send(ta.value); } });
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`; });
    $('[data-file]').addEventListener('change', async (e) => {
      for (const f of e.target.files) {
        const isText = /^text\/|json|csv|markdown/.test(f.type) || /\.(txt|md|csv|json)$/i.test(f.name);
        const a = { name: f.name, size: f.size, type: f.type };
        if (isText && f.size < 2e6) a.text = (await f.text()).slice(0, 20000);
        attachments.push(a);
      }
      e.target.value = '';
      paintAttachments();
      if (!ta.value) ta.value = 'Resume el adjunto';
      ta.focus();
    });
    on(view, 'click', '[data-unattach]', (e, b) => { attachments.splice(Number(b.dataset.unattach), 1); paintAttachments(); });
    on(view, 'click', '[data-suggest]', (e, b) => send(b.dataset.suggest));
    on(view, 'click', '[data-act]', async (e, b) => {
      const conv = store.ai.get(currentId);
      const [mi, ai] = b.dataset.act.split(':').map(Number);
      if (conv && (await runAction(conv, mi, ai))) paint();
    });
    const select = (id) => { currentId = id; history.replaceState(null, '', id ? `#/asistente/${id}` : '#/asistente'); paint(); };
    on(view, 'click', '[data-conv]', (e, el) => select(el.dataset.conv));
    on(view, 'keydown', '[data-conv]', (e, el) => { if (e.key === 'Enter') select(el.dataset.conv); });
    on(view, 'click', '[data-new]', () => newConversationSheet((c) => select(c.id)));
    on(view, 'click', '[data-memory]', () => memorySheet());
    $('[data-filter]').addEventListener('change', (e) => { projectFilter = e.target.value; paintSide(); });
    $('[data-delconv]').addEventListener('click', async () => {
      if (!(await confirmSheet({ title: 'Borrar conversación', text: 'Se elimina de este dispositivo. No afecta a ningún otro sistema.', confirm: 'Borrar', danger: true }))) return;
      store.ai.remove(currentId); select(null); toast('Conversación borrada');
    });
    $('[data-history]').addEventListener('click', () => {
      openSheet({
        title: 'Conversaciones',
        body: `<div style="margin-bottom:10px">${projectSelect('filter', projectFilter)}</div><div data-list></div>`,
        footer: `<button class="btn primary" data-n>${icon('plus', 'sm')}Nueva conversación</button>`,
        onMount(el, close) {
          const p = () => { el.querySelector('[data-list]').innerHTML = convListHTML(); };
          el.querySelector('[data-filter]').addEventListener('change', (e) => { projectFilter = e.target.value; p(); paintSide(); });
          on(el, 'click', '[data-conv]', (e, c) => { close(); select(c.dataset.conv); });
          el.querySelector('[data-n]').addEventListener('click', () => { close(); newConversationSheet((c) => select(c.id)); });
          p();
        },
      });
    });

    // Voz: dictado con Web Speech si el navegador lo ofrece.
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let rec = null;
    $('[data-mic]').addEventListener('click', () => {
      if (!SR) { toast('Este navegador no permite dictado aquí. En iPhone, usa el micrófono del teclado.', 'mic'); ta.focus(); return; }
      if (rec) { rec.stop(); return; }
      rec = new SR(); rec.lang = 'es-ES'; rec.interimResults = true; rec.continuous = false;
      const base = ta.value ? `${ta.value} ` : '';
      const mic = $('[data-mic]'); const hint = $('[data-hint]');
      mic.classList.add('primary'); hint.textContent = 'Escuchando…';
      rec.onresult = (ev) => { ta.value = base + Array.from(ev.results).map((r) => r[0].transcript).join(''); ta.dispatchEvent(new Event('input')); };
      rec.onerror = (ev) => toast(ev.error === 'not-allowed' ? 'Permite el micrófono para dictar' : 'No se pudo dictar', 'mic');
      rec.onend = () => { rec = null; mic.classList.remove('primary'); hint.textContent = ''; };
      try { rec.start(); } catch { rec = null; }
    });

    paint();
    const q = new URLSearchParams(location.hash.split('?')[1] || '').get('q');
    if (q) { history.replaceState(null, '', location.hash.split('?')[0]); send(q); }
  },
};
