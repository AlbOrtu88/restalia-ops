// Módulo escrito por GPT-6.1 Terra (OpenWork) y revisado.
import { esc, debounce, matches, fmtDateTime, relTime, addDays } from '../core/utils.js';
import { icon, badge, demoBadge, empty, pageHead, seg, demoNotice, field, readForm, openSheet, toast, on, bindSeg } from '../core/ui.js';
import * as store from '../core/store.js';

let canal = 'todos';
let consulta = '';
let pestana = 'bandeja';

const etiquetas = [['bandeja', 'Bandeja'], ['importantes', 'Importantes'], ['pendientes', 'Pendientes'], ['compromisos', 'Compromisos'], ['tareas', 'Tareas detectadas']];
const lista = (v) => (Array.isArray(v) ? v : []);

function mensajesFiltrados() {
  return lista(store.all('mensajes'))
    .filter((m) => (canal === 'todos' || m.canal === canal) && (!consulta || matches(m, consulta, ['de', 'asunto', 'extracto'])))
    .sort((a, b) => (Date.parse(b.fecha) || 0) - (Date.parse(a.fecha) || 0));
}
const filasDe = (mensajes, campo) => mensajes.flatMap((msg) => lista(msg[campo]).map((texto, indice) => ({ msg, texto, indice })));

function filaMensaje(msg) {
  const o = msg.canal === 'outlook';
  return `
    <button type="button" class="li" data-action="abrir" data-id="${esc(msg.id)}" style="width:100%;text-align:left;border:0;border-bottom:1px solid var(--border);background:none;color:inherit;font:inherit">
      <span class="li-icon ${o ? 'blue' : 'purple'}">${icon(o ? 'mail' : 'teams')}</span>
      <span class="li-main"><span class="li-title" style="display:block">${esc(msg.de)} ${demoBadge(msg)} ${msg.importante ? badge('Importante', 'red') : ''}</span>
        <span class="li-sub" style="display:block">${esc(msg.asunto)} · ${esc(msg.extracto)}</span></span>
      <span class="stack" style="gap:4px;align-items:flex-end;flex:none"><span class="xs subtle">${esc(msg.fecha ? relTime(msg.fecha) : '')}</span>${msg.pendiente ? badge('Pendiente', 'amber') : ''}</span>
    </button>`;
}

function mostrarDetalle(id, repintar) {
  const msg = store.find('mensajes', id);
  if (!msg) { toast('No se ha encontrado el mensaje', 'alert'); return; }
  const canalTexto = msg.canal === 'outlook' ? 'Outlook' : `Teams · ${msg.equipo || ''} · ${msg.canalTeams || ''}`;
  const local = msg.localId ? `<a href="#/locales/${esc(encodeURIComponent(msg.localId))}" data-local>${esc(store.localName(msg.localId) || msg.localId)}</a>` : 'Sin local';
  const seccion = (t, els) => (els.length ? `<section><h4 style="margin:14px 0 6px">${t}</h4><ul style="margin:0;padding-left:18px">${els.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : '');
  openSheet({
    title: msg.asunto || 'Mensaje',
    body: `
      <dl class="props">
        <dt>De</dt><dd>${esc(msg.de)} ${demoBadge(msg)}</dd>
        <dt>Canal</dt><dd>${esc(canalTexto)}</dd>
        <dt>Fecha</dt><dd>${esc(msg.fecha ? fmtDateTime(msg.fecha) : '')}</dd>
        <dt>Local</dt><dd>${local}${msg.localPorTexto ? ' <span class="xs subtle">(por mención en el texto)</span>' : ''}</dd>
        ${msg.prioridad ? `<dt>Prioridad</dt><dd>${esc(msg.prioridad)}${msg.plazo ? ` · plazo detectado: ${esc(msg.plazo.texto)}` : ''}</dd>` : ''}
      </dl>
      ${msg.inferido ? '<p class="xs subtle" style="margin:8px 0 0">Prioridad, solicitudes, plazos y compromisos detectados automáticamente por reglas: son indicios, compruébalos en el original.</p>' : ''}
      <h4 style="margin:14px 0 6px">Extracto</h4><p style="margin:0">${esc(msg.extracto)}</p>
      ${seccion('Compromisos', lista(msg.compromisos))}
      ${seccion('Tareas detectadas', lista(msg.tareasDetectadas))}`,
    footer: `
      ${msg.url && /^https:\/\//.test(msg.url) ? `<a class="btn" href="${esc(msg.url)}" target="_blank" rel="noopener">${icon('external', 'sm')}Abrir original</a>` : ''}
      ${msg.pendiente ? '<button type="button" class="btn" data-atender>Marcar como atendido</button>' : ''}
      <button type="button" class="btn primary" data-responder>${icon('edit', 'sm')}Preparar respuesta</button>`,
    onMount(sheet, close) {
      sheet.querySelector('[data-local]')?.addEventListener('click', close);
      sheet.querySelector('[data-atender]')?.addEventListener('click', () => {
        const a = store.find('mensajes', id);
        if (a?.pendiente) { store.update('mensajes', id, { pendiente: false }); store.log(`Alberto marcó como atendido «${a.asunto}»`, 'comunicaciones'); toast('Mensaje marcado como atendido'); }
        close(); repintar();
      });
      sheet.querySelector('[data-responder]')?.addEventListener('click', () => { close(); prepararRespuesta(msg); });
    },
  });
}

function prepararRespuesta(msg) {
  const outlook = msg.canal === 'outlook';
  openSheet({
    title: `Responder a ${msg.de}`,
    body: `<div class="notice">${icon('lock')}<div>No se envía nada. La respuesta queda en <b>Aprobaciones</b> y solo saldrá cuando la apruebes y ${outlook ? 'Outlook' : 'Teams'} esté conectado.</div></div>
      <form class="form" style="margin-top:12px">${field({ label: 'Mensaje', name: 'texto', type: 'textarea', value: `Hola,\n\n\n\nUn saludo,\n${store.getSettings().userName || 'Alberto'}`, rows: 8 })}</form>`,
    footer: `<button type="button" class="btn" data-cancel>Cancelar</button><button type="button" class="btn primary" data-aprobar>${icon('approve', 'sm')}Enviar a aprobación</button>`,
    onMount(sheet, close) {
      let enviada = false;
      sheet.querySelector('[data-cancel]').addEventListener('click', close);
      sheet.querySelector('[data-aprobar]').addEventListener('click', () => {
        if (enviada) return;
        const texto = String(readForm(sheet.querySelector('form')).texto || '').trim();
        if (!texto) { toast('Escribe una respuesta', 'alert'); return; }
        enviada = true;
        store.add('aprobaciones', {
          accion: `Responder «${msg.asunto}»`,
          sistema: outlook ? 'Outlook' : 'Teams',
          motivo: 'Respuesta preparada por Alberto',
          datos: outlook ? { Para: msg.de, Asunto: `RE: ${msg.asunto}`, Mensaje: texto } : { Equipo: msg.equipo, Canal: msg.canalTeams, 'En respuesta a': msg.de, Mensaje: texto },
          resultado: outlook ? 'Se envía la respuesta desde la cuenta corporativa.' : 'Se publica la respuesta en el canal de Teams.',
          estado: 'Pendiente', creada: new Date().toISOString(), origen: 'Alberto', historial: [], ref: { col: 'mensajes', id: msg.id },
          op: { type: outlook ? 'mail.reply' : 'teams.reply', ref: msg.source?.ref || null }, // el backend no envía nada en esta fase
        }, { prefix: 'apr' });
        store.log(`Alberto preparó una respuesta a «${msg.asunto}» (pendiente de aprobación)`, 'aprobaciones');
        toast('Enviado a Aprobaciones');
        close();
      });
    },
  });
}

export default {
  id: 'comunicaciones', title: 'Comunicaciones', icon: 'chat',
  render(view, params = []) {
    view.innerHTML = `
      ${pageHead('Comunicaciones', 'Outlook y Teams en un solo lugar.', '')}
      ${store.all('mensajes').some((r) => r.demo) ? demoNotice('<b>Outlook y Teams no están conectados.</b> Estos mensajes son ejemplos. Responder crea una propuesta en <a href="#/aprobaciones">Aprobaciones</a>; nada se envía sin tu visto bueno.') : ''}
      <div class="toolbar" style="margin-top:14px">
        ${seg('canal', [{ value: 'todos', label: 'Todos' }, { value: 'outlook', label: 'Outlook', icon: 'mail' }, { value: 'teams', label: 'Teams', icon: 'teams' }], canal)}
        <div class="search">${icon('search', 'sm')}<input type="search" aria-label="Buscar mensajes" placeholder="Buscar por remitente o asunto" value="${esc(consulta)}" data-buscar></div>
      </div>
      <div class="tabs" data-pestanas role="tablist"></div>
      <div class="card" data-contenido></div>`;
    const pestanasEl = view.querySelector('[data-pestanas]');
    const contenidoEl = view.querySelector('[data-contenido]');

    function repintar() {
      const mensajes = mensajesFiltrados();
      const grupos = { bandeja: mensajes, importantes: mensajes.filter((m) => m.importante), pendientes: mensajes.filter((m) => m.pendiente), compromisos: filasDe(mensajes, 'compromisos'), tareas: filasDe(mensajes, 'tareasDetectadas') };
      pestanasEl.innerHTML = etiquetas.map(([v, l]) => `<button type="button" role="tab" class="${pestana === v ? 'on' : ''}" data-action="pestana" data-tab="${v}" aria-selected="${pestana === v}">${l} <span class="subtle">${grupos[v].length}</span></button>`).join('');
      const els = grupos[pestana];
      if (!els.length) { contenidoEl.innerHTML = empty('No hay resultados con estos filtros.', 'chat'); return; }
      if (pestana === 'compromisos' || pestana === 'tareas') {
        contenidoEl.innerHTML = `<div class="list">${els.map(({ msg, texto, indice }) => {
          const creada = lista(msg.tareasCreadas).includes(texto);
          const control = pestana === 'tareas'
            ? (creada ? badge('Tarea creada', 'green') : `<button type="button" class="btn sm" data-action="crear" data-id="${esc(msg.id)}" data-indice="${indice}">${icon('plus', 'sm')}Crear tarea</button>`)
            : `<button type="button" class="btn ghost sm" data-action="abrir" data-id="${esc(msg.id)}">Abrir</button>`;
          return `<div class="li"><span class="li-icon ${pestana === 'tareas' ? 'teal' : 'amber'}">${icon(pestana === 'tareas' ? 'checksq' : 'flag', 'sm')}</span><div class="li-main"><div class="li-title" style="white-space:normal">${esc(texto)}</div><div class="li-sub">${esc(msg.de)} · ${esc(msg.asunto)}</div></div>${control}</div>`;
        }).join('')}</div>`;
        return;
      }
      contenidoEl.innerHTML = `<div class="list">${els.map(filaMensaje).join('')}</div>`;
    }

    on(view, 'click', '[data-action]', (e, el) => {
      const a = el.dataset.action;
      if (a === 'pestana') { pestana = el.dataset.tab; repintar(); }
      else if (a === 'abrir') mostrarDetalle(el.dataset.id, repintar);
      else if (a === 'crear') {
        const msg = store.find('mensajes', el.dataset.id);
        const titulo = msg && lista(msg.tareasDetectadas)[Number(el.dataset.indice)];
        if (!msg || !titulo || lista(msg.tareasCreadas).includes(titulo)) return;
        store.add('tareas', { titulo, descripcion: `Detectada en «${msg.asunto}» (${msg.de})`, responsable: 'Alberto', prioridad: msg.importante ? 'Alta' : 'Media', estado: 'Pendiente', creada: new Date().toISOString(), limite: addDays(new Date(), 3).toISOString(), proyectoId: null, localId: msg.localId, evidencias: [], origenRef: msg.id }, { prefix: 'tsk' });
        store.update('mensajes', msg.id, { tareasCreadas: [...lista(msg.tareasCreadas), titulo] });
        store.log(`Alberto creó la tarea «${titulo}» desde un mensaje`, 'tareas');
        toast('Tarea creada');
        repintar();
      }
    });
    bindSeg(view, 'canal', (v) => { canal = v; view.querySelectorAll('[data-seg="canal"] button').forEach((b) => { b.classList.toggle('on', b.dataset.val === v); b.setAttribute('aria-selected', b.dataset.val === v); }); repintar(); });
    const buscar = debounce((v) => { consulta = v; repintar(); }, 200);
    view.querySelector('[data-buscar]').addEventListener('input', (e) => buscar(e.target.value));
    repintar();
    if (params[0]) mostrarDetalle(params[0], repintar);
  },
};
