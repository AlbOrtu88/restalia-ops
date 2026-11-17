import * as store from '../core/store.js';
import { icon, badge, demoBadge, kpi, demoNotice, empty } from '../core/ui.js';
import { esc, greeting, fmtDateLong, fmtTime, relTime, addDays, startOfDay, toDate } from '../core/utils.js';
import { today, kpis, briefing } from '../core/insights.js';
import { bars, spark } from '../core/charts.js';

const MOD_ICON = { incidencias: 'alert', visitas: 'pin', tareas: 'checksq', auditorias: 'audit', aprobaciones: 'approve', locales: 'store', documentacion: 'folder', comunicaciones: 'chat', automatizaciones: 'zap' };
const MOD_COLOR = { incidencias: 'red', visitas: 'green', tareas: 'teal', auditorias: 'purple', aprobaciones: 'blue' };
const TYPE_LABEL = { reunion: 'Reunión', visita: 'Visita', auditoria: 'Auditoría', tarea: 'Tarea', seguimiento: 'Seguimiento', limite: 'Fecha límite' };

function weekly(col, field) {
  const out = [];
  for (let i = 7; i >= 0; i--) {
    const from = addDays(startOfDay(new Date()), -7 * i - 6), to = addDays(startOfDay(new Date()), -7 * i + 1);
    out.push(store.all(col).filter((r) => { const d = toDate(r[field]); return d >= from && d < to; }).length);
  }
  return out;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pl = (n, one, many) => `<b>${n}</b> ${n === 1 ? one : many}`;
const bl = (title, ic, items, emptyText) => `
  <div><h4>${icon(ic, 'sm')}${title}</h4>
  ${items.length ? `<ul>${items.map((x) => `<li>${x.href ? `<a href="${x.href}">${esc(x.text)}</a>` : esc(x.text)}</li>`).join('')}</ul>` : `<p class="small subtle">${emptyText}</p>`}</div>`;

export default {
  id: 'inicio', title: 'Inicio', icon: 'home',
  render(view) {
    const s = store.getSettings();
    const d = today();
    const k = kpis();
    const b = briefing();
    const hasDemo = store.all('locales').some((l) => l.demo);
    const act = store.all('actividad').slice().sort((a, c) => toDate(c.fecha) - toDate(a.fecha)).slice(0, 7);
    const vis = weekly('visitas', 'fecha');
    const inc = weekly('incidencias', 'fecha');

    view.innerHTML = `
      <div class="greet" style="margin:14px 0 18px">
        <p class="subtle small">${cap(fmtDateLong(new Date()))}</p>
        <h1>${greeting()}, ${esc(s.userName)}.</h1>
        <div class="daysum">
          <a class="pill" href="#/agenda">${icon('users', 'sm')}${pl(d.reuniones.length, 'reunión', 'reuniones')}</a>
          <a class="pill" href="#/tareas">${icon('checksq', 'sm')}${pl(d.tareasHoy.length, 'tarea hoy', 'tareas hoy')}</a>
          <a class="pill" href="#/agenda">${icon('pin', 'sm')}${pl(d.visitas.length, 'visita', 'visitas')}</a>
          <a class="pill" href="#/incidencias">${icon('alert', 'sm')}${pl(d.incAbiertas.length, 'incidencia abierta', 'incidencias abiertas')}</a>
          <a class="pill" href="#/agenda">${icon('flag', 'sm')}${pl(d.seguimientos.length, 'seguimiento', 'seguimientos')}</a>
        </div>
      </div>

      ${hasDemo ? demoNotice('<b>Estás viendo datos de ejemplo.</b> Locales, personas y cifras son ficticios y llevan la etiqueta DEMO. Se sustituirán por los de Notion y Microsoft 365 cuando estén conectados. <a href="#/configuracion">Ver estado de las conexiones</a>') : ''}

      <div class="grid g6" style="margin-top:16px">
        ${kpi({ label: 'Locales gestionados', value: k.locales, ic: 'store', href: '#/locales', foot: `${store.all('locales').filter((l) => l.estado === 'Abierto').length} abiertos` })}
        ${kpi({ label: 'Visitas · 30 días', value: k.visitas30, ic: 'pin', href: '#/visitas', foot: spark(vis, { w: 90, h: 22, color: 'var(--green)' }) })}
        ${kpi({ label: 'Auditorías pendientes', value: k.audPend, ic: 'audit', href: '#/auditorias', foot: 'programadas' })}
        ${kpi({ label: 'Incidencias abiertas', value: k.incAbiertas, ic: 'alert', href: '#/incidencias', foot: k.incCriticas ? `<span class="down">${k.incCriticas} críticas</span>` : 'ninguna crítica' })}
        ${kpi({ label: 'Acciones pendientes', value: k.accPend, ic: 'checksq', href: '#/tareas', foot: 'tareas sin cerrar' })}
        ${kpi({ label: 'Tareas vencidas', value: k.vencidas, ic: 'clock', href: '#/tareas', foot: k.vencidas ? '<span class="down">requieren atención</span>' : 'al día' })}
      </div>

      <div class="section-title"><h2>Briefing de hoy</h2>
        <span class="badge off" title="Generado en este dispositivo a partir de los datos cargados. No usa IA hasta conectar un proveedor.">${icon('info', 'sm')}Calculado en local</span>
        <a class="btn sm" href="#/asistente">${icon('sparkles', 'sm')}<span class="d-only">Preguntar al asistente</span></a>
      </div>
      <div class="card brief">
        ${bl('Resumen de hoy', 'sun', b.resumen, '')}
        ${bl('Prioridades', 'target', b.prioridades, 'Sin prioridades urgentes.')}
        ${bl('Próximos compromisos', 'calendar', b.compromisos, 'No quedan compromisos hoy.')}
        ${bl('Riesgos', 'alert', b.riesgos, 'Sin riesgos detectados.')}
        ${bl('Tareas atrasadas', 'clock', b.atrasadas, 'Ninguna tarea atrasada.')}
        ${bl('Recomendaciones', 'sparkles', b.recomendaciones, '')}
      </div>

      <div class="grid g2" style="margin-top:16px">
        <div class="card">
          <div class="card-h"><h3>Agenda de hoy</h3><a class="btn ghost sm" href="#/agenda">Ver agenda ${icon('right', 'sm')}</a></div>
          <div class="list">${d.agenda.length ? d.agenda.map((x) => `
            <div class="li" data-href="${x.href || '#/agenda/dia'}">
              <div class="ag-time">${fmtTime(x.inicio)}<span>${fmtTime(x.fin)}</span></div>
              <span class="ag-bar t-${x.tipo}" style="background:var(--c);align-self:stretch"></span>
              <div class="li-main"><div class="li-title">${esc(x.titulo)} ${demoBadge(x)}</div><div class="li-sub">${TYPE_LABEL[x.tipo] || x.tipo} · ${esc(x.ubicacion || '—')}</div></div>
              ${badge(x.estado)}
            </div>`).join('') : empty('No tienes nada más en la agenda de hoy', 'calendar')}</div>
        </div>
        <div class="card">
          <div class="card-h"><h3>Actividad reciente</h3><a class="btn ghost sm" href="#/informes">Informes ${icon('right', 'sm')}</a></div>
          <div class="list">${act.map((a) => `
            <div class="li" data-href="#/${a.modulo}">
              <span class="li-icon ${MOD_COLOR[a.modulo] || ''}">${icon(MOD_ICON[a.modulo] || 'history', 'sm')}</span>
              <div class="li-main"><div class="li-title" style="white-space:normal">${esc(a.texto)}</div><div class="li-sub">${relTime(a.fecha)} ${a.demo ? '· DEMO' : ''}</div></div>
            </div>`).join('') || empty('Sin actividad todavía', 'history')}</div>
        </div>
      </div>

      <div class="grid g2" style="margin-top:16px">
        <div class="card"><div class="card-h"><h3>Visitas por semana</h3><span class="xs subtle">Últimas 8 semanas</span></div><div class="card-b">${bars(vis.map((v, i) => ({ label: i === 7 ? 'Esta' : `S-${7 - i}`, value: v, tip: `${v} visitas` })), { color: 'var(--green)', highlightLast: true, height: 160 })}</div></div>
        <div class="card"><div class="card-h"><h3>Incidencias abiertas por semana</h3><span class="xs subtle">Últimas 8 semanas</span></div><div class="card-b">${bars(inc.map((v, i) => ({ label: i === 7 ? 'Esta' : `S-${7 - i}`, value: v, tip: `${v} incidencias nuevas` })), { color: 'var(--red)', highlightLast: true, height: 160 })}</div></div>
      </div>`;
  },
};
