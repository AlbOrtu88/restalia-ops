// Gráficos SVG ligeros (sin librerías). Barras finas con extremo redondeado, rejilla tenue,
// etiquetas en tokens de texto y tooltip al pasar/tocar. Todos dibujados a escala con un único eje.
import { esc } from './utils.js';

// Orden categórico fijo (nunca se recicla): azul, teal, morado, ámbar, gris
export const SERIES = ['var(--accent)', 'var(--teal)', 'var(--purple)', 'var(--amber)', 'var(--text-3)'];

function niceMax(v) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = Math.ceil(v / p);
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Barras verticales. data: [{label, value, tip?}] */
export function bars(data, { height = 180, color = SERIES[0], unit = '', highlightLast = false } = {}) {
  if (!data.length) return '<div class="empty">Sin datos para el periodo</div>';
  const W = 600, H = height, padL = 30, padB = 24, padT = 12;
  const max = niceMax(Math.max(...data.map((d) => d.value), 1));
  const iw = W - padL - 8, ih = H - padB - padT;
  const step = iw / data.length;
  const bw = Math.max(6, Math.min(28, step * 0.5));
  const ticks = [0, max / 2, max];
  const y = (v) => padT + ih - (v / max) * ih;
  const r = Math.min(4, bw / 2);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de barras">
    ${ticks.map((tv) => `<line class="grid-l" x1="${padL}" x2="${W - 8}" y1="${y(tv)}" y2="${y(tv)}" stroke-width="1"/><text x="${padL - 6}" y="${y(tv) + 4}" text-anchor="end">${Math.round(tv)}</text>`).join('')}
    ${data.map((d, i) => {
      const x = padL + step * i + (step - bw) / 2, h = Math.max(0, ih * (d.value / max)), top = padT + ih - h;
      const fill = highlightLast && i !== data.length - 1 ? 'color-mix(in srgb, ' + color + ' 45%, transparent)' : color;
      const path = h > r ? `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${top + h} Z` : `M${x},${top + h} h${bw} v${-h} h${-bw} Z`;
      const showLabel = data.length <= 14 || i % Math.ceil(data.length / 10) === 0;
      return `<g data-tip="${esc(d.tip || `${d.label}: ${d.value}${unit}`)}"><rect x="${padL + step * i}" y="${padT}" width="${step}" height="${ih}" fill="transparent"/><path d="${path}" fill="${fill}"/></g>
      ${showLabel ? `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(d.label)}</text>` : ''}`;
    }).join('')}
  </svg>`;
}

/** Barras horizontales (ranking). data: [{label, value, max?, color?, tip?}] */
export function hbars(data, { max, unit = '', color = SERIES[0] } = {}) {
  if (!data.length) return '<div class="empty">Sin datos</div>';
  const m = max ?? Math.max(...data.map((d) => d.value), 1);
  return `<div class="stack" style="gap:10px">${data.map((d) => `
    <div data-tip="${esc(d.tip || `${d.label}: ${d.value}${unit}`)}">
      <div class="row between small" style="margin-bottom:4px"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.label)}</span><b style="font-variant-numeric:tabular-nums">${d.value}${unit}</b></div>
      <div class="progress" style="height:8px"><span style="width:${(d.value / m) * 100}%;background:${d.color || color}"></span></div>
    </div>`).join('')}</div>`;
}

/** Barra apilada única (composición). parts: [{label, value, color}] con leyenda siempre visible */
export function stacked(parts) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return `<div style="display:flex;gap:2px;height:12px;border-radius:6px;overflow:hidden;background:var(--surface-3)">${parts.filter((p) => p.value).map((p) =>
    `<span data-tip="${esc(`${p.label}: ${p.value}`)}" style="flex:${p.value};background:${p.color}"></span>`).join('')}</div>
    <div class="legend" style="margin-top:10px">${parts.map((p) => `<span><i style="background:${p.color}"></i>${esc(p.label)} <b style="color:var(--text)">${p.value}</b></span>`).join('')}</div>`;
}

/** Sparkline con área y punto final destacado */
export function spark(values, { w = 120, h = 32, color = SERIES[0] } = {}) {
  if (values.length < 2) return '';
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const x = (i) => 2 + (i / (values.length - 1)) * (w - 4);
  const y = (v) => h - 3 - ((v - min) / (max - min || 1)) * (h - 6);
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polygon points="${x(0)},${h} ${pts} ${x(values.length - 1)},${h}" fill="${color}" opacity=".12"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${x(values.length - 1)}" cy="${y(values[values.length - 1])}" r="3" fill="${color}" stroke="var(--surface)" stroke-width="2"/></svg>`;
}

// Tooltip global para cualquier [data-tip]
let tipEl;
function showTip(e) {
  const el = e.target.closest?.('[data-tip]');
  if (!el) { if (tipEl) tipEl.style.opacity = '0'; return; }
  tipEl ||= Object.assign(document.body.appendChild(document.createElement('div')), { className: 'chart-tip' });
  tipEl.textContent = el.dataset.tip;
  const p = e.touches?.[0] || e;
  tipEl.style.opacity = '1';
  tipEl.style.left = Math.min(innerWidth - tipEl.offsetWidth - 8, p.clientX + 12) + 'px';
  tipEl.style.top = (p.clientY - 36) + 'px';
}
document.addEventListener('mousemove', showTip, { passive: true });
document.addEventListener('touchstart', showTip, { passive: true });
