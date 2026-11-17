// Módulo escrito por GPT-6.1 Terra (OpenWork) y revisado.
import { esc, relTime, addDays, isOverdue } from '../core/utils.js';
import { icon, demoBadge, pageHead, demoNotice, field, readForm, openSheet, toast, on } from '../core/ui.js';
import * as store from '../core/store.js';

const H48 = 48 * 3600 * 1000;
const SUPPORTED = new Set(['aut-01', 'aut-02', 'aut-03']);

/** Ejecuta las reglas locales activas. Se llama al abrir la app y desde «Ejecutar ahora». */
export function runLocalAutomations() {
  const results = [];
  for (const rule of store.all('automatizaciones').filter((r) => r.activa && r.ambito === 'local')) {
    let resultado;
    if (rule.id === 'aut-01') {
      const ya = new Set(store.all('tareas').map((t) => t.autoRef).filter(Boolean));
      const now = Date.now();
      let n = 0;
      for (const inc of store.all('incidencias')) {
        const last = new Date(inc.updatedAt || inc.fecha).getTime();
        const key = `aut-01:${inc.id}`;
        if (inc.prioridad !== 'Crítica' || ['Resuelta', 'Cerrada'].includes(inc.estado) || !Number.isFinite(last) || now - last <= H48 || ya.has(key)) continue;
        store.add('tareas', { titulo: `Escalar ${inc.id}: ${inc.titulo}`, descripcion: 'Incidencia crítica sin avance en 48 h (automatización).', responsable: 'Alberto', prioridad: 'Crítica', estado: 'Pendiente', creada: new Date().toISOString(), limite: addDays(new Date(), 1).toISOString(), proyectoId: null, localId: inc.localId, evidencias: [], origenRef: inc.id, autoRef: key }, { prefix: 'tsk' });
        ya.add(key);
        store.log(`Automatización: se escaló ${inc.id}`, 'automatizaciones');
        n++;
      }
      resultado = n ? `${n} ${n === 1 ? 'incidencia escalada' : 'incidencias escaladas'}` : 'Sin incidencias que escalar';
    } else if (rule.id === 'aut-03') {
      const n = store.all('tareas').filter((t) => isOverdue(t.limite, t.estado === 'Hecha')).length;
      resultado = `${n} ${n === 1 ? 'tarea vencida' : 'tareas vencidas'}`;
    } else if (rule.id === 'aut-02') {
      resultado = 'Se aplica al guardar una visita';
    } else continue;
    if (rule.ultimoResultado !== resultado || !rule.ultimaEjecucion) store.update('automatizaciones', rule.id, { ultimaEjecucion: new Date().toISOString(), ultimoResultado: resultado });
    results.push({ id: rule.id, nombre: rule.nombre, resultado });
  }
  return results;
}

function card(rule) {
  const backend = rule.ambito === 'backend';
  const canRun = SUPPORTED.has(rule.id);
  const status = backend
    ? `${icon('lock', 'sm')} ${rule.propuesta ? 'Propuesta guardada · pendiente de definición técnica' : 'Disponible cuando exista el backend'}`
    : rule.ultimaEjecucion ? `Última ejecución ${esc(relTime(rule.ultimaEjecucion))} · ${esc(rule.ultimoResultado || '')}` : 'Aún no se ha ejecutado';
  return `
    <article class="card pad stack" style="gap:10px">
      <div class="row between" style="gap:12px;align-items:flex-start">
        <div class="row grow" style="gap:10px;align-items:flex-start">
          <span class="li-icon ${backend ? '' : 'amber'}">${icon('zap', 'sm')}</span>
          <div><strong>${esc(rule.nombre)}</strong> ${demoBadge(rule)}<div class="small subtle" style="margin-top:2px">${esc(rule.descripcion || '')}</div></div>
        </div>
        <label class="switch" title="${backend ? 'Necesita el backend' : rule.activa ? 'Desactivar' : 'Activar'}">
          <input type="checkbox" data-toggle="${esc(rule.id)}" aria-label="${esc(`Activar ${rule.nombre}`)}" ${rule.activa ? 'checked' : ''} ${backend ? 'disabled' : ''}><span></span>
        </label>
      </div>
      <div class="chips"><span class="chip">${icon('clock', 'sm')}${esc(rule.disparador || '')}</span><span class="chip">${icon('play', 'sm')}${esc(rule.accion || '')}</span></div>
      <div class="row between wrap" style="gap:8px"><span class="xs subtle">${status}</span>
        ${!backend && rule.activa && canRun && rule.id !== 'aut-02' ? `<button class="btn sm" type="button" data-run="${esc(rule.id)}">${icon('play', 'sm')}Ejecutar ahora</button>` : ''}</div>
    </article>`;
}

export default {
  id: 'automatizaciones', title: 'Automatizaciones', icon: 'zap',
  render(view) {
    function paint() {
      const rules = store.all('automatizaciones');
      const local = rules.filter((r) => r.ambito === 'local');
      const backend = rules.filter((r) => r.ambito === 'backend');
      view.innerHTML = `
        ${pageHead('Automatizaciones', 'Reglas que trabajan por ti. Las de este dispositivo ya funcionan; las demás necesitan el servidor.', `<button type="button" class="btn primary" data-new>${icon('plus', 'sm')}<span>Nueva</span></button>`)}
        ${demoNotice('<b>Reglas de ejemplo.</b> Las de este dispositivo se ejecutan cada vez que abres la app. Las que dependen de Outlook, Notion o de un horario fijo esperan al backend, porque la app no puede ejecutarse con el iPhone bloqueado.')}
        <div class="section-title"><h2>Funcionan en este dispositivo</h2></div>
        <div class="grid g2">${local.map(card).join('') || '<p class="small subtle">No hay reglas locales.</p>'}</div>
        <div class="section-title"><h2>Requieren backend</h2></div>
        <div class="grid g2">${backend.map(card).join('') || '<p class="small subtle">No hay reglas pendientes.</p>'}</div>`;
    }

    on(view, 'change', '[data-toggle]', (e, el) => {
      const rule = store.find('automatizaciones', el.dataset.toggle);
      if (!rule || rule.ambito !== 'local') return;
      store.update('automatizaciones', rule.id, { activa: el.checked });
      store.log(`Automatización ${el.checked ? 'activada' : 'desactivada'}: ${rule.nombre}`, 'automatizaciones');
      toast(el.checked ? 'Automatización activada' : 'Automatización desactivada');
      paint();
    });
    on(view, 'click', '[data-run]', (e, el) => {
      const r = runLocalAutomations().find((x) => x.id === el.dataset.run);
      toast(r ? r.resultado : 'Activa la regla para ejecutarla', r ? 'zap' : 'info');
      paint();
    });
    on(view, 'click', '[data-new]', () => {
      openSheet({
        title: 'Nueva automatización',
        body: `<div class="notice">${icon('info')}<div>Las reglas nuevas se guardan como <b>propuesta</b>. No se ejecutan hasta que se implementen en el backend.</div></div>
          <form class="form" id="automation-form" style="margin-top:12px">
            ${field({ label: 'Nombre', name: 'nombre', required: true, placeholder: 'Ej.: Avisar si una auditoría baja de 70' })}
            ${field({ label: 'Cuándo', name: 'disparador', options: ['Al guardar una visita', 'Al crear una incidencia', 'Al cerrar una auditoría', 'Cada vez que abres la app', 'Todos los días, 8:00', 'Correo nuevo'] })}
            ${field({ label: 'Qué hace', name: 'accion', required: true, placeholder: 'Ej.: Crear tarea para el responsable del local' })}
            ${field({ label: 'Detalles', name: 'descripcion', type: 'textarea' })}
          </form>`,
        footer: '<button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit" form="automation-form">Guardar propuesta</button>',
        onMount(sheetEl, close) {
          const form = sheetEl.querySelector('#automation-form');
          form.addEventListener('submit', (ev) => {
            ev.preventDefault();
            const d = readForm(form);
            if (!d.nombre || !d.accion) { toast('Completa el nombre y la acción', 'alert'); return; }
            store.add('automatizaciones', { ...d, activa: false, ambito: 'backend', propuesta: true }, { prefix: 'aut' });
            store.log(`Alberto propuso la automatización «${d.nombre}»`, 'automatizaciones');
            close(); toast('Propuesta guardada'); paint();
          });
        },
      });
    });
    paint();
  },
};
