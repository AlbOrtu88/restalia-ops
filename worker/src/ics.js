// Agenda de Outlook/Teams SIN registro en Entra ID: el enlace ICS de «Publicar un calendario» de Outlook.
// · El enlace es un secreto (OUTLOOK_ICS_URL): quien lo tenga puede ver el calendario. Nunca llega a la app.
// · Solo lectura: los eventos se crean desde la app abriendo Outlook con el evento ya relleno (deeplink).
// · Se expanden las series (RRULE) en una ventana de 30 días atrás y 120 adelante, con EXDATE y excepciones.
import { shortHash } from './util.js';

const DAY = 864e5;
const WINDOWS_TZ = {
  'romance standard time': 'Europe/Madrid', 'w. europe standard time': 'Europe/Berlin', 'central europe standard time': 'Europe/Budapest',
  'gmt standard time': 'Europe/London', 'greenwich standard time': 'Atlantic/Reykjavik', 'utc': 'UTC', 'canary standard time': 'Atlantic/Canary',
};

/** Texto ICS → lista de bloques { name, props: [{ key, params, value }], children }. */
export function parseIcs(text) {
  const lines = String(text || '').replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const root = { name: 'ROOT', props: [], children: [] };
  const stack = [root];
  for (const line of lines) {
    if (!line) continue;
    const colon = indexOfUnquoted(line, ':');
    if (colon < 0) continue;
    const head = line.slice(0, colon), value = line.slice(colon + 1);
    const [key, ...rawParams] = splitUnquoted(head, ';');
    const K = key.toUpperCase();
    if (K === 'BEGIN') { const b = { name: value.toUpperCase(), props: [], children: [] }; stack[stack.length - 1].children.push(b); stack.push(b); continue; }
    if (K === 'END') { if (stack.length > 1) stack.pop(); continue; }
    const params = {};
    for (const p of rawParams) { const i = p.indexOf('='); if (i > 0) params[p.slice(0, i).toUpperCase()] = p.slice(i + 1).replace(/^"|"$/g, ''); }
    stack[stack.length - 1].props.push({ key: K, params, value });
  }
  return root;
}
function indexOfUnquoted(s, ch) { let q = false; for (let i = 0; i < s.length; i++) { if (s[i] === '"') q = !q; else if (s[i] === ch && !q) return i; } return -1; }
function splitUnquoted(s, ch) { const out = []; let q = false, cur = ''; for (const c of s) { if (c === '"') q = !q; if (c === ch && !q) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; }
const unescape = (v) => String(v || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
const prop = (b, k) => b.props.find((p) => p.key === k);
const props = (b, k) => b.props.filter((p) => p.key === k);

function resolveTz(tzid, fallback) {
  if (!tzid) return null;
  if (tzid.includes('/')) return tzid;
  return WINDOWS_TZ[tzid.toLowerCase()] || fallback;
}

/** Desfase (ms) de una zona horaria en un instante. */
function tzOffset(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}
/** Hora de reloj en una zona → milisegundos UTC (correcto en los cambios de hora). */
export function zonedToUtc(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo, d, h, mi, s);
  let utc = guess - tzOffset(guess, tz);
  utc = guess - tzOffset(utc, tz);
  return utc;
}

/** Valor de fecha ICS → { ms, allDay, wall:{y,mo,d,h,mi,s}, tz }. */
function parseDate(p, fallbackTz) {
  if (!p) return null;
  const v = p.value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const wall = { y: +m[1], mo: +m[2] - 1, d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0) };
  const allDay = p.params.VALUE === 'DATE' || !m[4];
  if (allDay) return { ms: Date.UTC(wall.y, wall.mo, wall.d), allDay: true, wall, tz: 'UTC' };
  if (m[7]) return { ms: Date.UTC(wall.y, wall.mo, wall.d, wall.h, wall.mi, wall.s), allDay: false, wall, tz: 'UTC' };
  const tz = resolveTz(p.params.TZID, fallbackTz) || fallbackTz;
  return { ms: zonedToUtc(wall.y, wall.mo, wall.d, wall.h, wall.mi, wall.s, tz), allDay: false, wall, tz };
}

const DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** Expande una serie en hora de reloj local (respeta cambios de hora). Devuelve inicios en ms UTC. */
export function expandRrule(rule, start, { from, to, max = 400 }) {
  const r = Object.fromEntries(rule.split(';').map((x) => x.split('=')).map(([k, v]) => [k.toUpperCase(), v]));
  const freq = r.FREQ, interval = Math.max(1, +r.INTERVAL || 1), count = r.COUNT ? +r.COUNT : Infinity;
  const until = r.UNTIL ? parseDate({ value: r.UNTIL, params: {} }, 'UTC')?.ms ?? Infinity : Infinity;
  const toMs = (y, mo, d) => (start.allDay ? Date.UTC(y, mo, d) : zonedToUtc(y, mo, d, start.wall.h, start.wall.mi, start.wall.s, start.tz));
  const out = [];
  let n = 0;
  const push = (ms) => { n++; if (n > count || ms > until) return false; if (ms >= from && ms <= to) out.push(ms); return ms <= to && out.length < max; };
  const w = start.wall;
  if (freq === 'WEEKLY') {
    const days = (r.BYDAY ? r.BYDAY.split(',').map((x) => DOW.indexOf(x.slice(-2))) : [new Date(Date.UTC(w.y, w.mo, w.d)).getUTCDay()]).filter((x) => x >= 0).sort();
    const base = Date.UTC(w.y, w.mo, w.d), baseDow = new Date(base).getUTCDay();
    const weekStart = base - baseDow * DAY; // domingo de la semana inicial
    for (let wk = 0; wk < 2000; wk += interval) {
      for (const dw of days) {
        const day = new Date(weekStart + (wk * 7 + dw) * DAY);
        if (day.getTime() < base) continue;
        if (!push(toMs(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()))) return out;
      }
    }
    return out;
  }
  for (let i = 0; i < 5000; i++) {
    let y = w.y, mo = w.mo, d = w.d;
    if (freq === 'DAILY') { const t = new Date(Date.UTC(w.y, w.mo, w.d) + i * interval * DAY); y = t.getUTCFullYear(); mo = t.getUTCMonth(); d = t.getUTCDate(); }
    else if (freq === 'MONTHLY') { const t = new Date(Date.UTC(w.y, w.mo + i * interval, 1)); y = t.getUTCFullYear(); mo = t.getUTCMonth(); if (new Date(Date.UTC(y, mo, d)).getUTCMonth() !== mo) continue; }
    else if (freq === 'YEARLY') { y = w.y + i * interval; if (new Date(Date.UTC(y, mo, d)).getUTCMonth() !== mo) continue; }
    else { push(start.ms); return out; }
    if (!push(toMs(y, mo, d))) return out;
  }
  return out;
}

/**
 * Convierte el ICS en registros de la colección «eventos» (mismo formato que los de Graph).
 * Las series con BYDAY de tipo «2TU» (mensual por día de la semana) se muestran solo en su primera fecha.
 */
export async function icsToRecords(text, { tz = 'Europe/Madrid', from = Date.now() - 30 * DAY, to = Date.now() + 120 * DAY } = {}) {
  const cal = parseIcs(text).children.find((c) => c.name === 'VCALENDAR');
  if (!cal) throw new Error('El enlace no devuelve un calendario ICS');
  const events = cal.children.filter((c) => c.name === 'VEVENT');
  const overrides = new Map(); // uid|recurrence-id → evento modificado
  for (const e of events) { const rid = parseDate(prop(e, 'RECURRENCE-ID'), tz); if (rid) overrides.set(`${prop(e, 'UID')?.value}|${rid.ms}`, e); }
  const out = [];
  for (const e of events) {
    const uid = prop(e, 'UID')?.value || '';
    const start = parseDate(prop(e, 'DTSTART'), tz);
    if (!start) continue;
    const endP = parseDate(prop(e, 'DTEND'), tz);
    const dur = endP ? endP.ms - start.ms : start.allDay ? DAY : 0;
    let starts = [start.ms];
    const rrule = prop(e, 'RRULE')?.value;
    if (rrule && !prop(e, 'RECURRENCE-ID')) {
      const ex = new Set(props(e, 'EXDATE').flatMap((p) => p.value.split(',').map((v) => parseDate({ value: v, params: p.params }, tz)?.ms)));
      starts = expandRrule(rrule, start, { from, to }).filter((ms) => !ex.has(ms) && !overrides.has(`${uid}|${ms}`));
    } else if (start.ms + dur < from || start.ms > to) continue;
    for (const ms of starts) out.push(await toRecord(e, uid, ms, ms + dur, start.allDay));
  }
  return out;
}

async function toRecord(e, uid, startMs, endMs, allDay) {
  const desc = unescape(prop(e, 'DESCRIPTION')?.value);
  const teams = prop(e, 'X-MICROSOFT-SKYPETEAMSMEETINGURL')?.value || (desc.match(/https:\/\/teams\.microsoft\.com\/l\/meetup-join\/\S+/) || [])[0] || null;
  const attendees = props(e, 'ATTENDEE').length;
  const status = (prop(e, 'STATUS')?.value || '').toUpperCase();
  const busy = (prop(e, 'X-MICROSOFT-CDO-BUSYSTATUS')?.value || '').toUpperCase();
  const iso = (ms) => new Date(ms).toISOString();
  const ref = `ics:${uid}:${iso(startMs)}`;
  return {
    ref,
    data: {
      id: `ics-${await shortHash(ref)}`, titulo: unescape(prop(e, 'SUMMARY')?.value) || '(sin título)', tipo: 'reunion',
      inicio: iso(startMs), fin: iso(endMs), allDay, ubicacion: unescape(prop(e, 'LOCATION')?.value) || (teams ? 'Teams' : ''),
      responsable: (prop(e, 'ORGANIZER')?.params.CN || '').replace(/^"|"$/g, ''),
      estado: status === 'CANCELLED' ? 'Cancelado' : status === 'TENTATIVE' || busy === 'TENTATIVE' ? 'Provisional' : busy === 'OOF' ? 'Fuera de la oficina' : busy === 'FREE' ? 'Libre' : 'Confirmado',
      cancelado: status === 'CANCELLED', asistentes: attendees, online: !!teams, url: teams, origen: 'Outlook (calendario publicado)', localId: null,
      esReunion: attendees > 0 || !!teams, descripcion: desc.slice(0, 600) || null,
    },
  };
}
