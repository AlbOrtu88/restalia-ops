// Bandeja de aprobaciones: toda escritura en Notion, Outlook o Teams pasa por aquí.
// Aprobar NUNCA simula la ejecución: sin backend la propuesta queda «En cola (sin conexión)».
import * as store from '../core/store.js';
import { icon, badge, demoBadge, empty, pageHead, seg, bindSeg, demoNotice, openSheet, confirmSheet, toast, on } from '../core/ui.js';
import { esc, fmtDateTime, relTime, toDate } from '../core/utils.js';
import { request, backendConfigured, NotConnectedError } from '../adapters/backend.js';

const SYS = { Notion: { ic: 'db', c: '' }, Outlook: { ic: 'mail', c: 'blue' }, Teams: { ic: 'teams', c: 'purple' } };
const COLOR = { 'Pendiente (Notion)': 'amber', 'Aprobado': 'green', 'Rechazado': 'red', 'Pendiente': 'amber', 'En cola (sin conexión)': 'blue', 'Ejecutada': 'green', 'Rechazada': 'red', 'Error': 'red' };
const st = { tab: 'pendientes' };
const COL_HREF = { visitas: 'visitas', incidencias: 'incidencias', mensajes: 'comunicaciones', tareas: 'tareas', auditorias: 'auditorias' };

const histEntry = (accion, nota = '') => ({ fecha: new Date().toISOString(), accion, por: store.getSettings().userName || 'Alberto', nota });

async function approve(a) {
  const ok = await confirmSheet({
    title: 'Aprobar propuesta',
    text: backendConfigured()
      ? `Se enviará al backend para ejecutar en ${a.sistema}: «${a.accion}».`
      : `Quedará aprobada y en cola. No se ejecutará en ${a.sistema} hasta que el backend esté conectado.`,
    confirm: 'Aprobar',
  });
  if (!ok) return;
  const hist = [...(a.historial || []), histEntry('Aprobada')];
  try {
    const r = await request('/approvals/execute', { method: 'POST', body: { id: a.id, sistema: a.sistema, accion: a.accion, datos: a.datos, ref: a.ref || null, op: a.op || null }, system: a.sistema });
    const omitidos = r?.skipped?.length ? `Sin rellenar en Notion: ${r.skipped.join(', ')}` : '';
    store.update('aprobaciones', a.id, { estado: 'Ejecutada', historial: [...hist, histEntry('Ejecutada', [r?.ref ? `Ref. ${r.ref}` : '', omitidos].filter(Boolean).join(' · '))], resuelta: new Date().toISOString(), refUrl: r?.url || a.refUrl || null });
    // Alta en Notion: el registro de la app guarda la página creada y se oculta cuando llega en la siguiente sincronización (sin duplicados).
    if (a.op?.type === 'notion.create' && a.ref?.col && a.ref?.id && r?.ref) store.update(a.ref.col, a.ref.id, { notionRef: r.ref, notionUrl: r.url || null });
    toast(omitidos ? `Ejecutada en ${a.sistema} · ${r.skipped.length} campo(s) sin rellenar` : `Ejecutada en ${a.sistema}`);
  } catch (e) {
    if (e instanceof NotConnectedError) {
      store.update('aprobaciones', a.id, { estado: 'En cola (sin conexión)', historial: [...hist, histEntry('En cola', e.message)], resuelta: new Date().toISOString() });
      toast('Aprobada · en cola hasta conectar el backend', 'clock');
    } else {
      store.update('aprobaciones', a.id, { estado: 'Error', historial: [...hist, histEntry('Error', e.message)] });
      toast(`No se pudo ejecutar: ${e.message}`, 'alert');
    }
  }
  store.log(`Alberto aprobó «${a.accion}»`, 'aprobaciones');
}

function reject(a, done) {
  openSheet({
    title: 'Rechazar propuesta',
    body: `<p class="small" style="margin-top:0">«${esc(a.accion)}» no se ejecutará.</p><div class="field"><label for="f-motivo">Motivo (opcional)</label><textarea class="textarea" id="f-motivo" rows="3"></textarea></div>`,
    footer: '<button class="btn" data-close>Cancelar</button><button class="btn danger" data-ok>Rechazar</button>',
    onMount(el, close) {
      el.querySelector('[data-ok]').addEventListener('click', () => {
        const nota = el.querySelector('#f-motivo').value.trim();
        store.update('aprobaciones', a.id, { estado: 'Rechazada', historial: [...(a.historial || []), histEntry('Rechazada', nota)], resuelta: new Date().toISOString() });
        store.log(`Alberto rechazó «${a.accion}»`, 'aprobaciones');
        close(); toast('Propuesta rechazada', 'x'); done();
      });
    },
  });
}

function modify(a, done) {
  const keys = Object.keys(a.datos || {});
  openSheet({
    title: 'Modificar datos',
    body: `<p class="small subtle" style="margin-top:0">Cambia lo que se enviará a ${esc(a.sistema)}. La propuesta sigue pendiente de aprobación.</p>
      <form class="form" id="mod-form">${keys.map((k, i) => {
        const v = String(a.datos[k] ?? '');
        return `<div class="field"><label for="m-${i}">${esc(k)}</label>${v.length > 60 || /mensaje|cuerpo|observ/i.test(k) ? `<textarea class="textarea" id="m-${i}" name="${esc(k)}" rows="5">${esc(v)}</textarea>` : `<input class="input" id="m-${i}" name="${esc(k)}" value="${esc(v)}">`}</div>`;
      }).join('')}</form>`,
    footer: '<button class="btn" data-close>Cancelar</button><button class="btn primary" type="submit" form="mod-form">Guardar cambios</button>',
    onMount(el, close) {
      el.querySelector('#mod-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const datos = {};
        new FormData(e.target).forEach((v, k) => { datos[k] = String(v); });
        const changed = keys.filter((k) => String(a.datos[k] ?? '') !== datos[k]);
        if (!changed.length) { close(); return; }
        store.update('aprobaciones', a.id, { datos, historial: [...(a.historial || []), histEntry('Modificada', `Campos: ${changed.join(', ')}`)] });
        store.log(`Alberto modificó la propuesta «${a.accion}»`, 'aprobaciones');
        close(); toast('Cambios guardados'); done();
      });
    },
  });
}

function cardHTML(a) {
  const s = SYS[a.sistema] || { ic: 'plug', c: '' };
  const pend = a.estado === 'Pendiente' || a.estado === 'Error';
  const refHref = a.ref?.col && COL_HREF[a.ref.col] ? `#/${COL_HREF[a.ref.col]}/${a.ref.id}` : '';
  return `<article class="card" data-apr="${a.id}">
    <div class="card-b">
      <div class="row" style="gap:10px;align-items:flex-start">
        <span class="li-icon ${s.c}">${icon(s.ic, 'sm')}</span>
        <div style="flex:1;min-width:0">
          <div class="row wrap" style="gap:6px"><strong style="font-size:15px">${esc(a.accion)}</strong> ${demoBadge(a)}</div>
          <div class="xs subtle" style="margin-top:2px">${esc(a.sistema)} · ${esc(a.origen || '')} · ${relTime(a.creada)}</div>
        </div>
        ${badge(a.estado, COLOR[a.estado])}
      </div>
      <dl class="props stack-m" style="margin-top:12px">
        <dt>Motivo</dt><dd>${esc(a.motivo || '—')}</dd>
        <dt>Datos</dt><dd><div class="stack" style="gap:4px">${Object.entries(a.datos || {}).map(([k, v]) => `<div><span class="subtle">${esc(k)}:</span> <span style="white-space:pre-wrap">${esc(v)}</span></div>`).join('')}</div></dd>
        <dt>Resultado</dt><dd>${esc(a.resultado || '—')}</dd>
        ${refHref ? `<dt>Origen</dt><dd><a href="${refHref}">Ver registro ${esc(a.ref.id)}</a></dd>` : ''}
      </dl>
      ${pend ? `<div class="btn-row apr-actions" style="margin-top:14px;justify-content:flex-end">
        <button class="btn" data-mod="${a.id}">${icon('edit', 'sm')}Modificar</button>
        <button class="btn" data-rej="${a.id}">${icon('x', 'sm')}Rechazar</button>
        <button class="btn primary" data-ok="${a.id}">${icon('check', 'sm')}Aprobar</button>
      </div>` : ''}
      ${(a.historial || []).length ? `<details style="margin-top:12px"><summary class="xs subtle" style="cursor:pointer">Historial (${a.historial.length})</summary>
        <div class="timeline" style="margin-top:8px">${a.historial.map((h) => `<div class="tl-item"><span class="tl-dot"></span><div><div class="small"><b>${esc(h.accion)}</b> · ${esc(h.por || '')}${h.nota ? ` · ${esc(h.nota)}` : ''}</div><div class="xs subtle">${fmtDateTime(h.fecha)}</div></div></div>`).join('')}</div></details>` : ''}
    </div>
  </article>`;
}

export default {
  id: 'aprobaciones', title: 'Aprobaciones', icon: 'approve',
  render(view) {
    function paint() {
      const all = store.all('aprobaciones').slice().sort((a, b) => toDate(b.creada) - toDate(a.creada));
      const pend = all.filter((a) => a.estado === 'Pendiente' || a.estado === 'Error');
      const hist = all.filter((a) => !pend.includes(a));
      const list = st.tab === 'pendientes' ? pend : hist;
      view.innerHTML = `
        ${pageHead('Aprobaciones', 'Nada se escribe en Notion ni se envía por Outlook o Teams sin tu visto bueno.')}
        ${backendConfigured() ? '' : `<div class="notice">${icon('lock')}<div><b>El backend aún no está conectado.</b> Puedes aprobar, rechazar o modificar. Lo aprobado queda <b>en cola</b> y no se ejecuta en ningún sistema hasta la conexión.</div></div>`}
        ${all.some((a) => a.demo) ? demoNotice('Las propuestas con etiqueta DEMO son ejemplos.') : ''}
        <div class="toolbar" style="margin-top:14px">${seg('atab', [{ value: 'pendientes', label: `Pendientes (${pend.length})` }, { value: 'historial', label: `Historial (${hist.length})` }], st.tab)}</div>
        <div class="stack">${list.map(cardHTML).join('') || empty(st.tab === 'pendientes' ? 'No hay nada pendiente de aprobar.' : 'Todavía no hay decisiones registradas.', 'approve')}</div>`;
    }
    bindSeg(view, 'atab', (v) => { st.tab = v; paint(); });
    on(view, 'click', '[data-ok]', async (e, b) => { const a = store.find('aprobaciones', b.dataset.ok); if (a) { await approve(a); paint(); } });
    on(view, 'click', '[data-rej]', (e, b) => { const a = store.find('aprobaciones', b.dataset.rej); if (a) reject(a, paint); });
    on(view, 'click', '[data-mod]', (e, b) => { const a = store.find('aprobaciones', b.dataset.mod); if (a) modify(a, paint); });
    paint();
  },
};
