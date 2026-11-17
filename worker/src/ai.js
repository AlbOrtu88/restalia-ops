// Asistente IA con recuperación sobre los datos sincronizados (D1) y citas numeradas.
// Proveedor intercambiable: anthropic | openai | workers-ai (Cloudflare, sin clave externa). Lo elige AI_PROVIDER o el que tenga clave.
// El modelo debe separar Hechos (citados), Inferencias y Recomendaciones, y no inventar datos.
import { HttpError, Budget, norm, audit, now } from './util.js';
import { searchFiles } from './graph.js';
import { vaultGet } from './util.js';

const DAY = 864e5;

export function aiProvider(env, requested) {
  const avail = { anthropic: !!env.ANTHROPIC_API_KEY, openai: !!env.OPENAI_API_KEY, 'workers-ai': !!env.AI };
  if (requested && requested !== 'auto' && avail[requested]) return requested;
  if (env.AI_PROVIDER && avail[env.AI_PROVIDER]) return env.AI_PROVIDER;
  return Object.keys(avail).find((k) => avail[k]) || null;
}

async function load(env, collection, limit = 400) {
  const { results } = await env.DB.prepare('SELECT system, ref, data FROM records WHERE collection = ? AND deleted = 0 ORDER BY updated_at DESC LIMIT ?').bind(collection, limit).all();
  return results.map((r) => ({ ...JSON.parse(r.data), _system: r.system }));
}

const fmt = (d) => (d ? new Date(d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 's/f');
const closed = (e) => /hecha|cancelad|cerrad|resuelt/i.test(e || '');

/** Reúne el contexto relevante para la pregunta. Devuelve { text, sources }. */
export async function retrieve(env, question) {
  const q = norm(question);
  const t = Date.now();
  const sources = [];
  const lines = [];
  const add = (section, item, label, url, system) => {
    const n = sources.length + 1;
    sources.push({ n, title: label.slice(0, 120), url: url || null, system, section });
    lines.push(`[${n}] ${label}`);
  };
  const section = (title) => lines.push(`\n## ${title}`);

  const [tareas, incid, eventos, visitas, mensajes, locales] = await Promise.all(['tareas', 'incidencias', 'eventos', 'visitas', 'mensajes', 'locales'].map((c) => load(env, c)));
  const locById = Object.fromEntries(locales.map((l) => [l.id, l.nombre]));
  const loc = (x) => x.localNombre || locById[x.localId] || '';

  section('Tareas y acciones abiertas (Notion · Acciones y seguimientos)');
  tareas.filter((x) => !closed(x.estado)).sort((a, b) => (a.limite || '9').localeCompare(b.limite || '9')).slice(0, 40)
    .forEach((x) => add('tareas', x, `${x.titulo} · estado ${x.estado || '—'} · compromiso ${x.limite ? fmt(x.limite) : 'sin fecha'}${loc(x) ? ' · ' + loc(x) : ''}`, x.url, 'Notion'));
  section('Incidencias abiertas (Notion · Incidencias)');
  incid.filter((x) => !closed(x.estado)).slice(0, 25)
    .forEach((x) => add('incidencias', x, `${x.titulo} · ${x.categoria || 'sin categoría'} · estado ${x.estado || '—'}${loc(x) ? ' · ' + loc(x) : ''}${x.accion ? ' · acción: ' + x.accion : ''}`, x.url, 'Notion'));
  section('Agenda de los próximos 14 días (Outlook + Agenda Restalia)');
  eventos.filter((x) => x.inicio && Date.parse(x.inicio) > t - DAY && Date.parse(x.inicio) < t + 14 * DAY && !x.cancelado).sort((a, b) => a.inicio.localeCompare(b.inicio)).slice(0, 40)
    .forEach((x) => add('agenda', x, `${fmt(x.inicio)} · ${x.titulo}${x.ubicacion ? ' · ' + x.ubicacion : ''} (${x.origen || 'Agenda'})`, x.url, x._system === 'graph' ? 'Outlook' : 'Notion'));
  section('Visitas (últimos 14 días y próximas 21)');
  visitas.filter((x) => x.fecha && Math.abs(Date.parse(x.fecha) - t) < 21 * DAY).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 25)
    .forEach((x) => add('visitas', x, `${fmt(x.fecha)} · ${x.titulo || 'Visita'} · ${loc(x) || 'local s/d'} · estado ${x.estado || '—'}${x.resultado ? ' · resultado ' + x.resultado : ''}`, x.url, 'Notion'));
  section('Comunicaciones recientes (Outlook y Teams, prioridad y solicitud detectadas por reglas)');
  const days = /\bhoy\b/.test(q) ? 1 : /semana/.test(q) ? 7 : 3;
  mensajes.filter((x) => x.fecha && Date.parse(x.fecha) > t - days * DAY).sort((a, b) => (b.importante - a.importante) || b.fecha.localeCompare(a.fecha)).slice(0, 30)
    .forEach((x) => add('mensajes', x, `${fmt(x.fecha)} · ${x.canal === 'teams' ? 'Teams' : 'Correo'} de ${x.de}: «${x.asunto}» — ${String(x.extracto || '').slice(0, 160)}${x.pendiente ? ' · [solicitud detectada]' : ''}${x.plazo ? ' · [plazo detectado: ' + x.plazo.texto + ']' : ''}`, x.url, x.canal === 'teams' ? 'Teams' : 'Outlook'));
  if (/contact|responsable|gerente|franquic|compromis/.test(q)) {
    section('Contactos (Notion · Contactos)');
    (await load(env, 'contactos', 200)).slice(0, 30).forEach((x) => add('contactos', x, `${x.nombre} · ${x.rol || ''} · ${x.localNombre || ''}${x.email ? ' · ' + x.email : ''}`, x.url, 'Notion'));
  }
  if (/local|visitar|tienda|restaurante/.test(q)) {
    section('Locales (Notion · Locales)');
    locales.slice(0, 60).forEach((x) => add('locales', x, `${x.nombre} · estado ${x.estado || '—'} · última visita ${x.ultimaVisita ? fmt(x.ultimaVisita) : 'sin registrar'}${x.direccion ? ' · ' + x.direccion : ''}`, x.url, 'Notion'));
  }
  if (/document|procedim|manual|archivo|busca|protocolo|plantilla|informe/.test(q)) {
    section('Documentos (OneDrive/SharePoint, solo lectura)');
    let docs = [];
    const terms = q.split(/\W+/).filter((w) => w.length > 3 && !/busca|documento|procedimiento|donde|tengo/.test(w));
    if (await vaultGet(env, 'ms')) { try { docs = await searchFiles(env, new Budget(3), terms.join(' ') || question); } catch { /* sin búsqueda en vivo */ } }
    if (!docs.length) docs = (await load(env, 'documentos', 2000)).filter((d) => terms.some((w) => norm(d.titulo).includes(w))).slice(0, 10);
    docs.slice(0, 10).forEach((x) => add('documentos', x, `${x.titulo} · ${x.ubicacion || ''} · modificado ${fmt(x.fecha)}`, x.url, x.origen || 'OneDrive'));
  }
  return { text: lines.join('\n').slice(0, 24000), sources };
}

const SYSTEM = `Eres el asistente operativo de Alberto Ortuño (operaciones de Restalia). Hoy es {HOY} (zona Europe/Madrid).
Responde en español, claro y breve, con estas secciones cuando apliquen:
**Hechos** — solo datos que aparecen en el CONTEXTO, cada uno con su cita [n].
**Inferencias** — conclusiones razonadas a partir de los hechos, marcadas como inferencias.
**Recomendaciones** — próximos pasos sugeridos.
Reglas: no inventes datos, cifras, KPIs ni personas. Si el contexto no contiene la respuesta, dilo y sugiere dónde mirar.
Las solicitudes y plazos de correos/Teams están detectados por reglas automáticas: trátalos como indicios, no como hechos seguros.
No envíes nada ni prometas acciones: cualquier cambio en Notion o envío de correo requiere aprobación de Alberto en la app.`;

async function callModel(env, provider, model, system, messages) {
  if (provider === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: model || env.AI_MODEL || 'claude-sonnet-5-5', max_tokens: 1500, system, messages }) });
    const d = await r.json();
    if (!r.ok) throw new HttpError(502, `Anthropic ${r.status}: ${d?.error?.type || 'error'}`);
    return { text: d.content.map((c) => c.text || '').join(''), model: d.model };
  }
  if (provider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: model || env.AI_MODEL || 'gpt-4.1-mini', messages: [{ role: 'system', content: system }, ...messages], max_tokens: 1500 }) });
    const d = await r.json();
    if (!r.ok) throw new HttpError(502, `OpenAI ${r.status}: ${d?.error?.code || 'error'}`);
    return { text: d.choices[0].message.content, model: d.model };
  }
  if (provider === 'workers-ai') {
    const m = model || env.AI_MODEL_CF || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
    let d;
    try { d = await env.AI.run(m, { messages: [{ role: 'system', content: system }, ...messages], max_tokens: 1500 }); } catch (e) { throw new HttpError(502, `Workers AI no respondió: ${String(e.message).slice(0, 80)}`); }
    return { text: d.response || '', model: m };
  }
  throw new HttpError(503, 'No hay proveedor de IA configurado en el backend', 'ai');
}

export async function chat(env, body, session) {
  const provider = aiProvider(env, body.provider);
  if (!provider) throw new HttpError(503, 'No hay proveedor de IA configurado en el backend', 'ai');
  const msgs = (body.messages || []).filter((m) => m.content && ['user', 'assistant'].includes(m.role)).slice(-10)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 6000) }));
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') throw new HttpError(400, 'Falta la pregunta');
  const question = msgs[msgs.length - 1].content;
  const ctx = await retrieve(env, question);
  const memory = (body.context?.memory || []).slice(0, 20).map((m) => `- ${String(m).slice(0, 300)}`).join('\n');
  const hoy = new Date().toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const system = `${SYSTEM.replace('{HOY}', hoy)}\n\nNOTAS DE TRABAJO DE ALBERTO:\n${memory || '(ninguna)'}\n\nCONTEXTO (datos reales sincronizados; cita con [n]):\n${ctx.text || '(no hay datos sincronizados todavía)'}`;
  const out = await callModel(env, provider, body.model, system, msgs);
  const cited = new Set([...out.text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  await audit(env, 'ai.chat', { actor: session.user, detail: `${provider} · ${ctx.sources.length} fuentes · ${cited.size} citadas` }); // no se guarda el contenido
  return { content: out.text, sources: ctx.sources.filter((s) => cited.has(s.n)), provider, model: out.model, at: now(), actions: [] };
}
