// Componentes de interfaz reutilizables (HTML + comportamiento)
import { esc } from './utils.js';

const P = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checksq: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>',
  store: '<path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18"/><path d="M9 20v-6h6v6"/>',
  pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  audit: '<rect x="5" y="3.5" width="14" height="18" rx="2"/><path d="M9 3.5h6v3H9zM9 12l2 2 4-4M9 17h6"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
  doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.8 7L4 20.5l1.5-4.6A8 8 0 1 1 21 12z"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15v2M11 11v6M15 7v10M19 12v5"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  approve: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  mic: '<rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5"/>',
  clip: '<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
  send: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  kanban: '<rect x="3" y="3" width="5" height="18" rx="1.5"/><rect x="10" y="3" width="5" height="12" rx="1.5"/><rect x="17" y="3" width="4" height="8" rx="1.5"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
  camera: '<path d="M4 7.5h3l2-2.5h6l2 2.5h3a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  teams: '<rect x="3" y="6" width="12" height="12" rx="2"/><path d="M6.5 9.5h5M9 9.5V15"/><circle cx="18.5" cy="7.5" r="2"/><path d="M15 11h5.5a1 1 0 0 1 1 1v3a3 3 0 0 1-3 3H15"/>',
  flag: '<path d="M4 21V4M4 4h12l-2 4 2 4H4"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  printer: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  play: '<path d="m6 4 14 8-14 8z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  arrowup: '<path d="M12 19V5M5 12l7-7 7 7"/>',
};
export const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || P.info}</svg>`;

// ---------- Estados y colores ----------
const STATUS_COLOR = {
  // tareas
  'Pendiente': 'amber', 'En curso': 'blue', 'Bloqueada': 'red', 'Hecha': 'green',
  // incidencias
  'Nueva': 'purple', 'Resuelta': 'green', 'Cerrada': '',
  // prioridades
  'Crítica': 'red', 'Alta': 'amber', 'Media': 'blue', 'Baja': '',
  // locales
  'Abierto': 'green', 'En obras': 'amber', 'Temporalmente cerrado': 'red', 'Próxima apertura': 'blue',
  'Activo': 'green', 'En seguimiento': 'amber', 'Inactivo': '', 'Pendiente de asignación': 'purple',
  // proyectos
  'Planificado': 'purple', 'En pausa': 'amber', 'Completado': 'green',
  // auditorías / eventos
  'Completada': 'green', 'Confirmado': 'blue', 'Cancelado': '',
  // visitas
  'Satisfactoria': 'green', 'Con incidencias': 'amber', 'Crítica ': 'red',
  // aprobaciones
  'Aprobada': 'green', 'Rechazada': 'red', 'En cola': 'teal', 'Modificada': 'purple',
};
export const statusColor = (v) => STATUS_COLOR[v] ?? '';
export const badge = (text, color = statusColor(text), dot = false) => `<span class="badge ${color}">${dot ? '<span class="dot"></span>' : ''}${esc(text)}</span>`;
export const demoBadge = (rec) => (rec?.demo ? '<span class="badge demo" title="Dato de ejemplo. Se sustituirá por datos reales al conectar la fuente.">DEMO</span>' : '');
export const sourceBadge = (rec) => {
  const s = rec?.source?.system;
  if (!s || s === 'demo') return '';
  const map = { local: ['Local · sin sincronizar', 'teal'], notion: ['Notion', ''], graph: ['Microsoft 365', 'blue'] };
  const [t, c] = map[s] || [s, ''];
  return `<span class="badge ${c}" title="Origen del registro">${t}</span>`;
};
export const prioIcon = (p) => ({ 'Crítica': 'red', 'Alta': 'amber', 'Media': 'blue', 'Baja': '' }[p] || '');

// ---------- Bloques ----------
export const empty = (text, ic = 'info') => `<div class="empty">${icon(ic)}<div>${esc(text)}</div></div>`;
export const kpi = ({ label, value, foot = '', ic = '', href = '' }) => `
  <div class="card kpi ${href ? 'click' : ''}" ${href ? `data-href="${href}"` : ''}>
    <div class="k-label">${ic ? icon(ic, 'sm') : ''}${esc(label)}</div>
    <div class="k-value">${value}</div>
    ${foot ? `<div class="k-foot">${foot}</div>` : ''}
  </div>`;
export const pageHead = (title, sub = '', actions = '') => `
  <div class="page-head">
    <div class="titles"><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div>
    ${actions ? `<div class="btn-row">${actions}</div>` : ''}
  </div>`;
export const seg = (name, options, value) => `<div class="seg" role="tablist" data-seg="${name}">${options
  .map((o) => `<button type="button" role="tab" data-val="${o.value}" class="${o.value === value ? 'on' : ''}" aria-selected="${o.value === value}">${o.icon ? icon(o.icon, 'sm') : ''}${esc(o.label)}</button>`)
  .join('')}</div>`;
export const demoNotice = (text) => `<div class="notice demo">${icon('info')}<div>${text}</div></div>`;
export const avatar = (raw) => { const name = String(raw || '?'); return `<span class="avatar" title="${esc(name)}">${esc(name.split(/\s+/).filter((w) => !/^demo$/i.test(w)).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?')}</span>`; };
export const progress = (pct) => `<div class="progress" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>`;
export const scoreCls = (n) => (n == null ? '' : n >= 85 ? 'good' : n >= 70 ? 'mid' : 'bad');

// ---------- Formularios ----------
export function field({ label, name, type = 'text', value = '', options = null, required = false, hint = '', placeholder = '', rows = 3, attrs = '' }) {
  const id = `f-${name}`;
  let ctl;
  if (options) {
    ctl = `<select id="${id}" name="${name}" ${required ? 'required' : ''} ${attrs}>${options
      .map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
      .map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(value ?? '') ? 'selected' : ''}>${esc(o.label)}</option>`)
      .join('')}</select>`;
  } else if (type === 'textarea') {
    ctl = `<textarea class="textarea" id="${id}" name="${name}" rows="${rows}" placeholder="${esc(placeholder)}" ${required ? 'required' : ''} ${attrs}>${esc(value)}</textarea>`;
  } else {
    ctl = `<input class="input" id="${id}" name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${required ? 'required' : ''} ${attrs}>`;
  }
  return `<div class="field"><label for="${id}">${esc(label)}${required ? ' *' : ''}</label>${ctl}${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
}
export function readForm(form) {
  const o = {};
  new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
  return o;
}

// ---------- Sheet (hoja inferior en iPhone, modal en escritorio) ----------
let sheetStack = [];
export function openSheet({ title, body, footer = '', wide = false, onMount, onClose }) {
  const root = document.getElementById('sheet-root');
  const wrap = document.createElement('div');
  wrap.className = 'sheet-backdrop';
  wrap.innerHTML = `
    <div class="sheet ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="grabber"></div>
      <div class="sheet-h"><h2>${esc(title)}</h2><button class="btn ghost icon sm" data-close aria-label="Cerrar">${icon('x')}</button></div>
      <div class="sheet-b">${body}</div>
      ${footer ? `<div class="sheet-f">${footer}</div>` : ''}
    </div>`;
  root.appendChild(wrap);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => wrap.classList.add('open'));
  const prevFocus = document.activeElement;
  const close = () => {
    wrap.classList.remove('open');
    sheetStack = sheetStack.filter((s) => s !== close);
    setTimeout(() => { wrap.remove(); if (!sheetStack.length) document.body.style.overflow = ''; prevFocus?.focus?.(); }, 220);
    onClose?.();
  };
  sheetStack.push(close);
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  // Deslizar hacia abajo para cerrar (iPhone)
  const sheet = wrap.querySelector('.sheet');
  let y0 = null;
  sheet.querySelector('.grabber').addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
  sheet.querySelector('.sheet-h').addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchmove', (e) => { if (y0 == null) return; const dy = e.touches[0].clientY - y0; if (dy > 0) sheet.style.transform = `translateY(${dy}px)`; }, { passive: true });
  sheet.addEventListener('touchend', (e) => { if (y0 == null) return; const dy = e.changedTouches[0].clientY - y0; y0 = null; sheet.style.transform = ''; if (dy > 90) close(); });
  onMount?.(sheet, close);
  setTimeout(() => sheet.querySelector('input:not([type=file]),textarea,select')?.focus({ preventScroll: true }), 260);
  return close;
}
/** Cierra todas las hojas abiertas (al cambiar de pantalla). */
export function closeAllSheets() { [...sheetStack].reverse().forEach((c) => c()); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetStack.length) sheetStack[sheetStack.length - 1](); });

export function confirmSheet({ title = '¿Confirmar?', text = '', confirm = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    openSheet({
      title,
      body: `<p class="muted">${text}</p>`,
      footer: `<button class="btn" data-close>Cancelar</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(confirm)}</button>`,
      onMount: (el, close) => el.querySelector('[data-ok]').addEventListener('click', () => { done = true; resolve(true); close(); }),
      onClose: () => { if (!done) resolve(false); },
    });
  });
}

// ---------- Toast ----------
export function toast(msg, ic = 'check') {
  const root = document.getElementById('toast-root');
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `${icon(ic, 'sm')}<span>${esc(msg)}</span>`;
  root.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2600);
}

// ---------- Delegación de eventos ----------
/** on(root, 'click', '[data-x]', (e, el) => …) */
export function on(root, type, sel, fn) {
  root.addEventListener(type, (e) => { const el = e.target.closest(sel); if (el && root.contains(el)) fn(e, el); });
}
/** Conecta un control .seg: llama a fn(valor) al pulsar */
export function bindSeg(root, name, fn) {
  on(root, 'click', `[data-seg="${name}"] button`, (e, b) => fn(b.dataset.val));
}

// ---------- Fotos: comprimir a JPEG ----------
export function compressImage(file, max = 1280, q = 0.78) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', q));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
