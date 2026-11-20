import * as store from '../core/store.js';
import { icon, badge, demoBadge, sourceBadge, empty, pageHead, field, readForm, openSheet, toast, on, demoNotice, compressImage, confirmSheet } from '../core/ui.js';
import { esc, matches, fmtDateFull, fmtDateTime, fmtDate, relDay, isoLocal, isoDate, addDays, toDate, debounce } from '../core/utils.js';
import { putMedia, hydrateMedia } from '../core/media.js';
import { backendConfigured } from '../adapters/backend.js';

const RESULTADOS = ['Satisfactoria', 'Con incidencias', 'Crítica'];
const MOTIVOS = ['Visita rutinaria', 'Visita sin aviso', 'Seguimiento de incidencia', 'Visita de calidad', 'Preparación de auditoría', 'Visita de apertura', 'Otro'];
const st = { q: '', res: '' };
const resColor = { Satisfactoria: 'green', 'Con incidencias': 'amber', 'Crítica': 'red' };

// Alta en Notion de una visita o incidencia creada en la app. Siempre pasa por Aprobaciones (nunca se escribe sin aprobar).
// El local va como relación (id de la página del local en Notion) y, de respaldo, con su nombre en texto.
// El backend omite lo que no encaje con la base (sin inventar opciones) y lo devuelve en «skipped».
export function notionFields(kind, rec) {
  const l = store.find('locales', rec.localId);
  const local = { localRel: l?.source?.system === 'notion' ? l.id : undefined, localNombre: l?.nombre || undefined };
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ''));
  if (kind === 'visita') {
    return clean({ titulo: `${rec.motivo || 'Visita'} · ${l?.nombre || 'local'}`, fecha: rec.fecha, ...local, observaciones: rec.observaciones, resultado: rec.resultado, motivo: rec.motivo });
  }
  return clean({ titulo: rec.titulo, ...local, categoria: rec.categoria, prioridad: rec.prioridad, severidad: rec.severidad, estado: rec.estado, fecha: rec.fecha ? String(rec.fecha).slice(0, 10) : null,
    limite: rec.limite ? String(rec.limite).slice(0, 10) : null, descripcion: rec.descripcion, accion: rec.accion, causaRaiz: rec.causaRaiz, siguientePaso: rec.siguientePaso, fechaObjetivo: rec.fechaObjetivo });
}

export function proposeToNotion(kind, rec, datos) {
  const col = kind === 'visita' ? 'visitas' : 'incidencias';
  if (rec.demo || rec.source?.system === 'notion' || store.all('aprobaciones').some((a) => a.ref?.id === rec.id && !['Rechazada', 'Error'].includes(a.estado))) return null;
  const l = store.find('locales', rec.localId);
  const apr = store.add('aprobaciones', {
    accion: `Crear ${kind} en Notion`, sistema: 'Notion', motivo: `Registro creado por Alberto en la app (${rec.id})`,
    datos: { ...datos, 'Enlace al local': l?.source?.system === 'notion' ? 'Relación con la ficha del local en Notion' : 'Solo nombre (el local no está en Notion)' },
    resultado: `Nuevo registro en la base «${kind === 'visita' ? 'Visitas' : 'Incidencias'}» enlazado al local.`,
    op: { type: 'notion.create', collection: col, fields: notionFields(kind, rec) },
    estado: 'Pendiente', creada: new Date().toISOString(), origen: 'Alberto', historial: [], ref: { col, id: rec.id },
  });
  // Alta directa (ajuste activado por defecto): lo que Alberto guarda se crea en Notion al momento, sin pasar por «Aprobar».
  // Solo altas nuevas de visitas e incidencias; los cambios en registros que ya están en Notion siguen pasando por Aprobaciones.
  if (store.getSettings().notionDirecto !== false && backendConfigured()) {
    import('./aprobaciones.js').then((m) => m.execute(apr, { auto: true })).then((r) => {
      if (!r) return;
      toast(r.ok ? `${kind === 'visita' ? 'Visita creada' : 'Incidencia creada'} en Notion${r.skipped.length ? ` · ${r.skipped.length} campo(s) sin rellenar` : ''}` : `No se pudo crear en Notion: queda en Aprobaciones (${r.error})`, r.ok ? 'check' : 'alert');
    }).catch(() => {});
  }
  return apr;
}
export const visitaDatos = (v) => ({ Local: store.localName(v.localId), Fecha: fmtDateTime(v.fecha), Motivo: v.motivo, Resultado: v.resultado, Observaciones: v.observaciones?.slice(0, 120) || '' });
export const incidenciaDatos = (x) => ({ Título: x.titulo, Local: store.localName(x.localId), Prioridad: x.prioridad, Severidad: x.severidad || '—', Estado: x.estado });
const isNotionLocal = (id) => store.find('locales', id)?.source?.system === 'notion';

function openForm(localId = '') {
  const locs = store.all('locales').map((l) => ({ value: l.id, label: l.nombre }));
  const photos = [];
  openSheet({
    title: 'Nueva visita',
    body: `<form class="form" id="v-form">
      ${field({ label: 'Local', name: 'localId', options: [{ value: '', label: 'Elige un local' }, ...locs], value: localId, required: true })}
      <div class="form-row">${field({ label: 'Fecha y hora', name: 'fecha', type: 'datetime-local', value: isoLocal(new Date()), required: true })}${field({ label: 'Motivo', name: 'motivo', options: MOTIVOS })}</div>
      ${field({ label: 'Objetivo', name: 'objetivo', placeholder: '¿Qué querías comprobar?' })}
      ${field({ label: 'Observaciones', name: 'observaciones', type: 'textarea', rows: 4, placeholder: 'Lo que has visto en el local' })}
      <div class="field"><label>Resultado</label><div class="seg" style="width:100%" id="v-res">${RESULTADOS.map((r, i) => `<button type="button" data-val="${r}" class="${i === 0 ? 'on' : ''}" style="flex:1;height:36px">${r}</button>`).join('')}</div><input type="hidden" name="resultado" value="Satisfactoria"></div>
      <div class="field"><label>Fotografías</label><div class="photos" id="v-photos"><label class="photo-add" aria-label="Añadir foto">${icon('camera')}<input type="file" accept="image/*" capture="environment" multiple hidden id="v-file"></label></div><div class="hint">Se guardan comprimidas en este dispositivo.</div></div>
      ${field({ label: 'Acciones correctivas', name: 'acciones', type: 'textarea', rows: 3, placeholder: 'Una por línea. Cada línea se convierte en una tarea.' })}
      ${field({ label: 'Incidencia detectada (opcional)', name: 'incidencia', placeholder: 'Título breve. Se abrirá una incidencia vinculada.' })}
      <div class="form-row">${field({ label: 'Responsable', name: 'responsable', value: store.getSettings().userName })}${field({ label: 'Seguimiento', name: 'seguimiento', type: 'date', hint: 'Déjalo vacío si no hace falta' })}</div>
    </form>`,
    footer: '<button class="btn" data-close>Cancelar</button><button class="btn primary" data-save>Guardar visita</button>',
    onMount(el, close) {
      const f = el.querySelector('#v-form');
      on(el, 'click', '#v-res button', (e, b) => { el.querySelectorAll('#v-res button').forEach((x) => x.classList.toggle('on', x === b)); f.resultado.value = b.dataset.val; });
      el.querySelector('#v-file').addEventListener('change', async (e) => {
        for (const file of e.target.files) {
          try { const url = await compressImage(file); const id = await putMedia(url, { kind: 'visita' }); if (id) { photos.push(id); el.querySelector('#v-photos').insertAdjacentHTML('afterbegin', `<img class="photo" src="${url}" alt="Foto de la visita">`); } }
          catch { toast('No se pudo leer la imagen', 'alert'); }
        }
        e.target.value = '';
      });
      el.querySelector('[data-save]').addEventListener('click', () => {
        if (!f.reportValidity()) return;
        const v = readForm(f);
        const acciones = v.acciones.split('\n').map((s) => s.trim()).filter(Boolean);
        const auto = store.find('automatizaciones', 'aut-02');
        let seguimiento = v.seguimiento ? new Date(v.seguimiento + 'T10:00').toISOString() : null;
        if (!seguimiento && v.resultado !== 'Satisfactoria' && auto?.activa) seguimiento = addDays(new Date(v.fecha), 7).toISOString();
        const incIds = [];
        if (v.incidencia) {
          const inc = store.add('incidencias', { id: store.nextIncidentId(), titulo: v.incidencia, localId: v.localId, categoria: 'Mantenimiento', descripcion: `Detectada en visita: ${v.observaciones}`.slice(0, 400), prioridad: v.resultado === 'Crítica' ? 'Alta' : 'Media', estado: 'Nueva', responsable: v.responsable, fecha: new Date().toISOString(), limite: addDays(new Date(), 7).toISOString(), accion: acciones[0] || '', seguimiento: [], evidencias: photos.slice() });
          incIds.push(inc.id);
        }
        const rec = store.add('visitas', { localId: v.localId, fecha: new Date(v.fecha).toISOString(), motivo: v.motivo, objetivo: v.objetivo, observaciones: v.observaciones, resultado: v.resultado, responsable: v.responsable, seguimiento, incidencias: incIds, acciones, fotos: photos }, { prefix: 'vis' });
        acciones.forEach((a) => store.add('tareas', { titulo: a, descripcion: `Acción correctiva de la visita a ${store.localName(v.localId)}`, responsable: store.find('locales', v.localId)?.responsable || 'Alberto', prioridad: v.resultado === 'Crítica' ? 'Alta' : 'Media', estado: 'Pendiente', creada: new Date().toISOString(), limite: addDays(new Date(), 7).toISOString(), proyectoId: null, localId: v.localId, evidencias: [], origenRef: rec.id }, { prefix: 'tsk' }));
        store.log(`Alberto registró una visita a ${store.localName(v.localId)}`, 'visitas');
        // Local real de Notion: la visita (y la incidencia detectada) se proponen a Notion automáticamente.
        let propuestas = 0;
        if (isNotionLocal(v.localId)) {
          if (proposeToNotion('visita', rec, visitaDatos(rec))) propuestas++;
          incIds.forEach((iid) => { const inc = store.find('incidencias', iid); if (inc && proposeToNotion('incidencia', inc, incidenciaDatos(inc))) propuestas++; });
        }
        close();
        toast(`Visita guardada${acciones.length ? ` · ${acciones.length} tareas creadas` : ''}${seguimiento && !v.seguimiento ? ' · seguimiento a 7 días' : ''}${propuestas ? (store.getSettings().notionDirecto !== false ? ' · enviando a Notion…' : ' · enviada a Aprobaciones para Notion') : ''}`);
        location.hash = `#/visitas/${rec.id}`;
      });
    },
  });
}

function list(view) {
  const paint = () => {
    const items = store.all('visitas').filter((v) => (!st.res || v.resultado === st.res) && matches({ ...v, local: store.localName(v.localId) }, st.q, ['local', 'motivo', 'objetivo', 'observaciones', 'responsable'])).sort((a, b) => toDate(b.fecha) - toDate(a.fecha));
    view.querySelector('#v-body').innerHTML = `<div class="card table-wrap"><table class="tbl mobile-list"><thead><tr><th>Local</th><th>Fecha</th><th>Motivo</th><th>Resultado</th><th>Acciones</th><th>Seguimiento</th></tr></thead><tbody>
      ${items.map((v) => `<tr data-href="#/visitas/${v.id}"><td class="primary">${esc(store.localName(v.localId))} ${demoBadge(v)}</td><td>${fmtDateTime(v.fecha)}</td><td>${esc(v.motivo)}</td><td>${badge(v.resultado, resColor[v.resultado])}</td><td class="hide-m">${v.acciones.length || '—'}</td><td class="hide-m">${v.seguimiento ? relDay(v.seguimiento) : '—'}</td></tr>`).join('')}
      </tbody></table>${items.length ? '' : empty('No hay visitas con estos filtros', 'pin')}</div>`;
  };
  view.innerHTML = `
    ${pageHead('Visitas', 'Registra lo que ves en cada local y genera el informe en un toque.', `<button class="btn primary" data-new>${icon('plus', 'sm')}Nueva visita</button>`)}
    <div class="toolbar">
      <div class="search">${icon('search', 'sm')}<input id="v-q" type="search" placeholder="Buscar visitas" value="${esc(st.q)}"></div>
      <div class="chips">${['', ...RESULTADOS].map((r) => `<button class="chip ${st.res === r ? 'on' : ''}" data-res="${r}">${r || 'Todas'}</button>`).join('')}</div>
    </div>
    <div id="v-body"></div>`;
  paint();
  view.querySelector('#v-q').addEventListener('input', debounce((e) => { st.q = e.target.value; paint(); }, 150));
  on(view, 'click', '[data-res]', (e, b) => { st.res = b.dataset.res; view.querySelectorAll('[data-res]').forEach((x) => x.classList.toggle('on', x === b)); paint(); });
  on(view, 'click', '[data-new]', () => openForm());
}

function report(view, id) {
  const v = store.find('visitas', id);
  if (!v) { view.innerHTML = `<div class="card" style="margin-top:20px">${empty('Visita no encontrada', 'pin')}</div>`; return; }
  const l = store.find('locales', v.localId) || {};
  const incs = v.incidencias.map((i) => store.find('incidencias', i)).filter(Boolean);
  const tareas = store.all('tareas').filter((t) => t.origenRef === v.id);
  const proposed = store.all('aprobaciones').some((a) => a.ref?.id === v.id);
  view.innerHTML = `
    <div class="no-print" style="margin:10px 0 4px"><a href="#/visitas" class="small">${icon('left', 'sm')} Visitas</a></div>
    <div class="page-head"><div class="titles"><p class="xs subtle" style="text-transform:uppercase;letter-spacing:.06em">Informe de visita · ${esc(v.id)}</p><div class="row wrap"><h1>${esc(l.nombre || '—')}</h1>${demoBadge(v)}${sourceBadge(v)}</div><p>${fmtDateTime(v.fecha)} · ${esc(v.motivo)} · ${esc(v.responsable)}</p></div>
      <div class="btn-row no-print">
        ${!v.demo ? `<button class="btn sm" data-notion ${proposed ? 'disabled' : ''}>${icon('upload', 'sm')}${proposed ? 'Propuesto a Notion' : 'Proponer a Notion'}</button>` : ''}
        <button class="btn sm" data-print>${icon('printer', 'sm')}PDF</button>
        ${!v.demo ? `<button class="btn sm danger" data-del aria-label="Eliminar">${icon('trash', 'sm')}</button>` : ''}
      </div></div>
    <div class="detail-grid"><div class="stack">
      <div class="card pad"><div class="row between"><h3>Resultado</h3>${badge(v.resultado, resColor[v.resultado])}</div>
        <h4 class="subtle" style="margin-top:14px">Objetivo</h4><p>${esc(v.objetivo || '—')}</p>
        <h4 class="subtle" style="margin-top:14px">Observaciones</h4><p style="white-space:pre-wrap">${esc(v.observaciones || '—')}</p></div>
      ${v.fotos.length ? `<div class="card pad"><h3>Fotografías</h3><div class="photos" style="margin-top:10px">${v.fotos.map((f) => `<img class="photo" data-media="${f}" alt="Foto de la visita" style="width:120px;height:120px">`).join('')}</div></div>` : ''}
      <div class="card"><div class="card-h"><h3>Acciones correctivas</h3><span class="xs subtle">${v.acciones.length}</span></div><div class="list">
        ${v.acciones.map((a) => { const t = tareas.find((x) => x.titulo === a); return `<div class="li" ${t ? `data-href="#/tareas/${t.id}"` : ''}><span class="li-icon teal">${icon('checksq', 'sm')}</span><div class="li-main"><div class="li-title" style="white-space:normal">${esc(a)}</div>${t ? `<div class="li-sub">${esc(t.responsable)} · ${relDay(t.limite)}</div>` : ''}</div>${t ? badge(t.estado) : ''}</div>`; }).join('') || empty('Sin acciones', 'checksq')}</div></div>
      <div class="card"><div class="card-h"><h3>Incidencias vinculadas</h3></div><div class="list">
        ${incs.map((i) => `<div class="li" data-href="#/incidencias/${i.id}"><span class="li-icon red">${icon('alert', 'sm')}</span><div class="li-main"><div class="li-title"><span class="mono">${i.id}</span> ${esc(i.titulo)}</div><div class="li-sub">${esc(i.categoria)} · ${esc(i.prioridad)}</div></div>${badge(i.estado)}</div>`).join('') || empty('Sin incidencias', 'alert')}</div></div>
    </div>
    <div class="card pad"><dl class="props">
      <dt>Local</dt><dd><a href="#/locales/${l.id}">${esc(l.nombre || '—')}</a></dd><dt>Código</dt><dd class="mono">${esc(l.codigo || '—')}</dd>
      <dt>Dirección</dt><dd>${esc(l.direccion || '')}, ${esc(l.ciudad || '')}</dd><dt>Responsable local</dt><dd>${esc(l.responsable || '—')}</dd>
      <dt>Visitado por</dt><dd>${esc(v.responsable)}</dd><dt>Seguimiento</dt><dd>${v.seguimiento ? `${fmtDateFull(v.seguimiento)} (${relDay(v.seguimiento)})` : 'No requerido'}</dd>
      <dt>Origen</dt><dd>${v.demo ? 'Ejemplo DEMO' : v.source?.system === 'local' ? 'Este dispositivo' : 'Notion'}</dd>
    </dl></div></div>
    <p class="print-only xs" style="margin-top:20px">Generado con Restalia Operations AI el ${fmtDateTime(new Date())}${v.demo ? ' · DATOS DE EJEMPLO' : ''}</p>`;
  hydrateMedia(view);
  if (view._rb) return; view._rb = 1;
  on(view, 'click', '[data-print]', () => window.print());
  on(view, 'click', '[data-notion]', () => {
    proposeToNotion('visita', v, visitaDatos(v));
    toast('Propuesta enviada a Aprobaciones'); report(view, id);
  });
  on(view, 'click', '[data-del]', async () => { if (await confirmSheet({ title: 'Eliminar visita', text: 'Se elimina de este dispositivo. Las tareas e incidencias creadas se mantienen.', confirm: 'Eliminar', danger: true })) { store.remove('visitas', id); toast('Visita eliminada'); location.hash = '#/visitas'; } });
}

export default {
  id: 'visitas', title: 'Visitas', icon: 'pin',
  render(view, params) {
    if (params[0] === 'nueva') { list(view); history.replaceState(null, '', '#/visitas'); setTimeout(() => openForm(params[1] || ''), 30); return; }
    if (params[0]) return report(view, params[0]);
    list(view);
  },
};
