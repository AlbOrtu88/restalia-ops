// Utilidades puras (sin DOM)
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = (p = 'id') => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const by = (k, dir = 1) => (a, b) => (a[k] > b[k] ? dir : a[k] < b[k] ? -dir : 0);
export const groupBy = (arr, fn) => arr.reduce((m, x) => { const k = typeof fn === 'function' ? fn(x) : x[fn]; (m[k] ||= []).push(x); return m; }, {});
export const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const matches = (obj, q, fields) => { if (!q) return true; const n = norm(q); return fields.some((f) => norm(obj[f]).includes(n)); };

// ---------- Fechas ----------
const LOCALE = 'es-ES';
export const toDate = (v) => (v instanceof Date ? v : new Date(v));
export const startOfDay = (v) => { const d = new Date(toDate(v)); d.setHours(0, 0, 0, 0); return d; };
export const endOfDay = (v) => { const d = new Date(toDate(v)); d.setHours(23, 59, 59, 999); return d; };
export const addDays = (v, n) => { const d = new Date(toDate(v)); d.setDate(d.getDate() + n); return d; };
export const addMonths = (v, n) => { const d = new Date(toDate(v)); d.setDate(1); d.setMonth(d.getMonth() + n); return d; };
export const startOfWeek = (v) => { const d = startOfDay(v); const w = (d.getDay() + 6) % 7; return addDays(d, -w); };
export const startOfMonth = (v) => { const d = startOfDay(v); d.setDate(1); return d; };
export const sameDay = (a, b) => a && b && startOfDay(a).getTime() === startOfDay(b).getTime();
export const isToday = (v) => sameDay(v, new Date());
export const diffDays = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / 864e5);
export const isOverdue = (v, done) => !done && v && toDate(v) < startOfDay(new Date());
export const isoDate = (v) => { const d = toDate(v); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const isoLocal = (v) => `${isoDate(v)}T${fmtTime(v)}`;
export const fmtTime = (v) => toDate(v).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
export const fmtDate = (v, opt = { day: 'numeric', month: 'short' }) => (v ? toDate(v).toLocaleDateString(LOCALE, opt) : '—');
export const fmtDateLong = (v) => fmtDate(v, { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtDateFull = (v) => fmtDate(v, { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDateTime = (v) => (v ? `${fmtDate(v)} · ${fmtTime(v)}` : '—');
export function relDay(v) {
  if (!v) return '—';
  const n = diffDays(v, new Date());
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Mañana';
  if (n === -1) return 'Ayer';
  if (n > 1 && n < 7) return `En ${n} días`;
  if (n < -1 && n > -7) return `Hace ${-n} días`;
  return fmtDate(v);
}
export function relTime(v) {
  const s = (Date.now() - toDate(v)) / 1000;
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `hace ${Math.floor(s / 86400)} d`;
  return fmtDate(v);
}
export function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
}
/** Generador de fechas relativas a hoy para datos DEMO: d(-2,'10:30') */
export function relDate(offset = 0, time = '09:00') {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() + offset);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h, m || 0, 0, 0);
  return d.toISOString();
}

// ---------- Descargas ----------
export function download(name, content, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
export function toCSV(rows, cols) {
  const q = (v) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = cols.map((c) => q(c.label)).join(';');
  const body = rows.map((r) => cols.map((c) => q(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(';')).join('\n');
  return '﻿' + head + '\n' + body; // BOM + ; para Excel en español
}
