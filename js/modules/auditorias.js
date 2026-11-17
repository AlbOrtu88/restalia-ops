import * as store from '../core/store.js';
import { icon, badge, demoBadge, empty, pageHead, seg, bindSeg, field, readForm, openSheet, toast, on, scoreCls, compressImage, confirmSheet } from '../core/ui.js';
import { esc, fmtDateFull, fmtDate, relDay, isoLocal, addDays, toDate } from '../core/utils.js';
import { putMedia, hydrateMedia } from '../core/media.js';
import { bars } from '../core/charts.js';

const st = { tab: 'historico' };
const ANS = [['ok', 'Cumple', 'green'], ['ko', 'No cumple', 'red'], ['na', 'N/A', '']];

/** Puntuación = cumple / (cumple + no cumple) × 100 */
export function score(respuestas) {
  const v = Object.values(respuestas || {}).map((r) => r.v);
  const ok = v.filter((x) => x === 'ok').length, ko = v.filter((x) => x === 'ko').length;
  return ok + ko ? Math.round((ok / (ok + ko)) * 100) : null;
}

function startForm(localId = '') {
  const cats = store.all('plantillas').map((t) => t.categoria);
  openSheet({
    title: 'Nueva auditoría',
    body: `<form class="form" id="a-form">
      ${field({ label: 'Local', name: 'localId', required: true, value: localId, options: [{ value: '', label: 'Elige un local' }, ...store.all('locales').map((l) => ({ value: l.id, label: l.nombre }))] })}
      ${field({ label: 'Fecha', name: 'fecha', type: 'datetime-local', value: isoLocal(new Date()) })}
      <div class="field"><label>Categorías</label><div class="chips" id="a-cats">${cats.map((c, i) => `<button type="button" class="chip ${i < 2 ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div></div>
      ${field({ label: 'Auditor', name: 'auditor', value: store.getSettings().userName })}
    </form>`,
    footer: '<button class="btn" data-close>Cancelar</button><button class="btn primary" data-go>Empezar checklist</button>',
    onMount(el, close) {
      on(el, 'click', '[data-cat]', (e, b) => b.classList.toggle('on'));
      el.querySelector('[data-go]').addEventListener('click', () => {
        const f = el.querySelector('#a-form'); if (!f.reportValidity()) return;
        const categorias = [...el.querySelectorAll('[data-cat].on')].map((b) => b.dataset.cat);
        if (!categorias.length) return toast('Elige al menos una categoría', 'alert');
        const v = readForm(f);
        const a = store.add('auditorias', { localId: v.localId, fecha: new Date(v.fecha).toISOString(), categorias, estado: 'En curso', auditor: v.auditor, puntuacion: null, hallazgos: [], respuestas: {} }, { prefix: 'aud' });
        store.log(`Auditoría iniciada en ${store.localName(v.localId)}`, 'auditorias');
        close(); location.hash = `#/auditorias/${a.id}`;
      });
    },
  });
}

function run(view, id) {
  const a = store.find('auditorias', id);
  if (!a) { view.innerHTML = `<div class="card" style="margin-top:20px">${empty('Auditoría no encontrada', 'audit')}</div>`; return; }
  const tpls = store.all('plantillas').filter((t) => a.categorias.includes(t.categoria));
  const done = a.estado === 'Completada';
  const r = a.respuestas || {};
  const total = tpls.reduce((s, t) => s + t.items.length, 0);
  const answered = Object.values(r).filter((x) => x.v).length;
  const sc = a.puntuacion ?? score(r);
  const tasks = store.all('tareas').filter((t) => t.origenRef === id);
  view.innerHTML = `
    <div style="margin:10px 0 4px"><a href="#/auditorias" class="small">${icon('left', 'sm')} Auditorías</a></div>
    <div class="page-head"><div class="titles"><div class="row wrap"><h1>${esc(store.localName(a.localId))}</h1>${demoBadge(a)}${badge(a.estado)}</div><p>${fmtDateFull(a.fecha)} · ${esc(a.auditor)} · ${esc(a.categorias.join(', '))}</p></div>
      <div class="card" style="padding:12px 18px;text-align:center;min-width:120px"><div class="xs subtle">Puntuación</div><div class="score ${scoreCls(sc)}" style="font-size:30px">${sc ?? '—'}</div><div class="xs subtle">${answered}/${total} respondidos</div></div></div>
    ${a.demo && !Object.keys(r).length ? `<div class="notice demo" style="margin-bottom:14px">${icon('info')}<div>Auditoría de ejemplo${done ? ' ya cerrada: se muestran sus hallazgos registrados.' : '. Puedes rellenar el checklist para probar el flujo.'}</div></div>` : ''}
    <div class="detail-grid"><div class="stack">
      ${done && !Object.keys(r).length ? '' : tpls.map((t) => `<div class="card"><div class="card-h"><h3>${esc(t.categoria)}</h3><span class="xs subtle">${t.items.filter((_, n) => r[`${t.id}:${n}`]?.v).length}/${t.items.length}</span></div>
        ${t.items.map((it, n) => { const k = `${t.id}:${n}`, cur = r[k] || {}; return `<div style="padding:12px 18px;border-bottom:1px solid var(--border)">
          <div class="row between wrap"><div class="grow" style="min-width:180px;font-size:14px">${esc(it)}</div>
          <div class="seg">${ANS.map(([v, l]) => `<button data-ans="${k}" data-v="${v}" class="${cur.v === v ? 'on' : ''}" ${done ? 'disabled' : ''} style="${cur.v === v && v === 'ko' ? 'color:var(--red)' : cur.v === v && v === 'ok' ? 'color:var(--green)' : ''}">${l}</button>`).join('')}</div></div>
          ${cur.v === 'ko' || cur.note || cur.photo ? `<div class="row" style="margin-top:8px"><input class="input" data-note="${k}" value="${esc(cur.note || '')}" placeholder="Hallazgo: qué has visto" style="min-height:36px;font-size:15px" ${done ? 'disabled' : ''}>
            <label class="btn icon sm" aria-label="Añadir foto">${icon('camera', 'sm')}<input type="file" accept="image/*" capture="environment" hidden data-photo="${k}" ${done ? 'disabled' : ''}></label>
            ${cur.photo ? `<img class="photo" data-media="${cur.photo}" alt="Evidencia" style="width:36px;height:36px">` : ''}</div>` : ''}
        </div>`; }).join('')}</div>`).join('')}
    </div>
    <div class="stack">
      <div class="card"><div class="card-h"><h3>Hallazgos</h3><span class="xs subtle">${(a.hallazgos || []).length}</span></div><div class="card-b">${(a.hallazgos || []).length ? `<ul style="margin:0;padding-left:18px">${a.hallazgos.map((h) => `<li class="small" style="margin:4px 0">${esc(h)}</li>`).join('')}</ul>` : '<p class="small subtle">Los «No cumple» con nota aparecerán aquí al cerrar.</p>'}</div></div>
      <div class="card"><div class="card-h"><h3>Plan correctivo</h3></div><div class="list">${tasks.map((t) => `<div class="li" data-href="#/tareas/${t.id}"><div class="li-main"><div class="li-title">${esc(t.titulo)}</div><div class="li-sub">${esc(t.responsable)} · ${relDay(t.limite)}</div></div>${badge(t.estado)}</div>`).join('') || `<div class="card-b small subtle">${done ? 'Sin acciones creadas.' : 'Se genera al cerrar la auditoría.'}</div>`}</div>
        ${done && (a.hallazgos || []).length && !tasks.length ? `<div class="card-b"><button class="btn sm" data-plan>${icon('plus', 'sm')}Crear acciones desde hallazgos</button></div>` : ''}</div>
      ${!done ? `<button class="btn primary" data-close-audit>${icon('check', 'sm')}Cerrar auditoría</button>` : ''}
      ${!a.demo ? `<button class="btn danger sm" data-del>${icon('trash', 'sm')}Eliminar auditoría</button>` : ''}
    </div></div>`;
  hydrateMedia(view);
  if (view._ab) return; view._ab = 1;
  const save = (k, patch) => { const cur = store.find('auditorias', id); const resp = { ...cur.respuestas, [k]: { ...(cur.respuestas || {})[k], ...patch } }; store.update('auditorias', id, { respuestas: resp, estado: cur.estado === 'Pendiente' ? 'En curso' : cur.estado }); };
  on(view, 'click', '[data-ans]', (e, b) => { save(b.dataset.ans, { v: b.dataset.v }); run(view, id); });
  on(view, 'change', '[data-note]', (e, i) => save(i.dataset.note, { note: i.value.trim() }));
  on(view, 'change', '[data-photo]', async (e, i) => { const f = i.files[0]; if (!f) return; const url = await compressImage(f); const m = await putMedia(url, { kind: 'auditoria' }); if (m) { save(i.dataset.photo, { photo: m }); run(view, id); } });
  const plan = (hallazgos) => hallazgos.forEach((h) => { const cur = store.find('auditorias', id); store.add('tareas', { titulo: `Corregir: ${h}`.slice(0, 120), descripcion: `Hallazgo de la auditoría ${id}`, responsable: store.find('locales', cur.localId)?.responsable || 'Alberto', prioridad: 'Alta', estado: 'Pendiente', creada: new Date().toISOString(), limite: addDays(new Date(), 7).toISOString(), proyectoId: null, localId: cur.localId, evidencias: [], origenRef: id }, { prefix: 'tsk' }); });
  on(view, 'click', '[data-close-audit]', async () => {
    const cur = store.find('auditorias', id);
    const resp = cur.respuestas || {};
    const items = Object.fromEntries(store.all('plantillas').flatMap((t) => t.items.map((it, n) => [`${t.id}:${n}`, it])));
    const hallazgos = Object.entries(resp).filter(([, x]) => x.v === 'ko').map(([k, x]) => (x.note ? `${items[k]}: ${x.note}` : items[k]));
    const s = score(resp);
    if (s == null) return toast('Responde al menos un punto del checklist', 'alert');
    if (!(await confirmSheet({ title: 'Cerrar auditoría', text: `Puntuación final: ${s}. Se crearán ${hallazgos.length} acciones correctivas con plazo de 7 días.`, confirm: 'Cerrar y crear acciones' }))) return;
    store.update('auditorias', id, { estado: 'Completada', puntuacion: s, hallazgos });
    plan(hallazgos);
    store.log(`Auditoría de ${store.localName(cur.localId)} cerrada con ${s} puntos`, 'auditorias');
    toast(`Auditoría cerrada · ${s} puntos`); run(view, id);
  });
  on(view, 'click', '[data-plan]', () => { plan(store.find('auditorias', id).hallazgos); toast('Acciones creadas'); run(view, id); });
  on(view, 'click', '[data-del]', async () => { if (await confirmSheet({ title: 'Eliminar auditoría', text: 'Se elimina de este dispositivo.', confirm: 'Eliminar', danger: true })) { store.remove('auditorias', id); location.hash = '#/auditorias'; } });
}

function templates() {
  return `<p class="small muted" style="margin-bottom:12px">Edita los puntos de cada categoría. Un punto por línea. Los cambios se aplican a las auditorías nuevas.</p>
    <div class="grid g2">${store.all('plantillas').map((t) => `<div class="card"><div class="card-h"><h3>${esc(t.categoria)}</h3><span class="xs subtle">${t.items.length} puntos</span></div><div class="card-b">
      <textarea class="textarea" data-tpl="${t.id}" rows="${Math.max(4, t.items.length + 1)}" aria-label="Puntos de ${esc(t.categoria)}">${esc(t.items.join('\n'))}</textarea></div></div>`).join('')}</div>`;
}

function historico() {
  const all = store.all('auditorias').sort((a, b) => toDate(b.fecha) - toDate(a.fecha));
  const done = all.filter((a) => a.puntuacion != null);
  const byLocal = Object.values(done.reduce((m, a) => { (m[a.localId] ||= []).push(a); return m; }, {})).map((l) => l[0]);
  return `<div class="grid g2" style="margin-bottom:16px">
      <div class="card"><div class="card-h"><h3>Última puntuación por local</h3><span class="xs subtle">0–100</span></div><div class="card-b">${bars(byLocal.map((a) => ({ label: store.localName(a.localId).replace('DEMO · Local ', '').split(' ')[0], value: a.puntuacion, tip: `${store.localName(a.localId)}: ${a.puntuacion}` })), { height: 170 })}</div></div>
      <div class="card"><div class="card-h"><h3>Pendientes</h3></div><div class="list">${all.filter((a) => a.estado !== 'Completada').map((a) => `<div class="li" data-href="#/auditorias/${a.id}"><span class="li-icon purple">${icon('audit', 'sm')}</span><div class="li-main"><div class="li-title">${esc(store.localName(a.localId))} ${demoBadge(a)}</div><div class="li-sub">${relDay(a.fecha)} · ${esc(a.categorias.join(', '))}</div></div>${badge(a.estado)}</div>`).join('') || empty('No hay auditorías pendientes', 'audit')}</div></div>
    </div>
    <div class="card table-wrap"><table class="tbl mobile-list"><thead><tr><th>Local</th><th>Fecha</th><th>Categorías</th><th>Auditor</th><th>Hallazgos</th><th>Puntuación</th></tr></thead><tbody>
      ${done.map((a) => `<tr data-href="#/auditorias/${a.id}"><td class="primary">${esc(store.localName(a.localId))} ${demoBadge(a)}</td><td>${fmtDate(a.fecha)}</td><td class="hide-m">${esc(a.categorias.join(', '))}</td><td class="hide-m">${esc(a.auditor)}</td><td>${a.hallazgos.length} hallazgos</td><td><span class="score ${scoreCls(a.puntuacion)}">${a.puntuacion}</span></td></tr>`).join('')}
    </tbody></table></div>`;
}

export default {
  id: 'auditorias', title: 'Auditorías', icon: 'audit',
  render(view, params) {
    if (params[0] === 'nueva') { window.history.replaceState(null, '', '#/auditorias'); setTimeout(() => startForm(params[1] || ''), 30); }
    else if (params[0]) return run(view, params[0]);
    const paint = () => { view.querySelector('#a-body').innerHTML = st.tab === 'plantillas' ? templates() : historico(); };
    view.innerHTML = `${pageHead('Auditorías', 'Checklists por categoría, puntuación automática, evidencias y plan correctivo.', `${seg('atab', [{ value: 'historico', label: 'Histórico' }, { value: 'plantillas', label: 'Plantillas' }], st.tab)}<button class="btn primary" data-new>${icon('plus', 'sm')}Nueva auditoría</button>`)}<div id="a-body"></div>`;
    paint();
    bindSeg(view, 'atab', (v) => { st.tab = v; view.querySelectorAll('[data-seg="atab"] button').forEach((b) => b.classList.toggle('on', b.dataset.val === v)); paint(); });
    on(view, 'click', '[data-new]', () => startForm());
    on(view, 'change', '[data-tpl]', (e, t) => { store.update('plantillas', t.dataset.tpl, { items: t.value.split('\n').map((s) => s.trim()).filter(Boolean) }); toast('Plantilla guardada'); });
  },
};
