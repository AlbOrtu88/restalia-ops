import * as store from '../core/store.js';
import { icon, badge, demoBadge, empty, pageHead, seg, bindSeg, demoNotice, on, scoreCls, toast } from '../core/ui.js';
import { esc, matches, fmtDate, fmtDateFull, relDay, isOverdue, toDate, debounce } from '../core/utils.js';

const st = { view: 'tabla', q: '', marca: '', estado: '', tab: 'resumen' };

function list(view) {
  const all = store.all('locales');
  const marcas = [...new Set(all.map((l) => l.marca))].sort();
  const estados = [...new Set(all.map((l) => l.estado))];
  const openInc = (id) => store.all('incidencias').filter((i) => i.localId === id && !['Resuelta', 'Cerrada'].includes(i.estado)).length;
  const lastVisit = (id) => store.all('visitas').filter((v) => v.localId === id).sort((a, b) => toDate(b.fecha) - toDate(a.fecha))[0];
  const lastAudit = (id) => store.all('auditorias').filter((a) => a.localId === id && a.puntuacion != null).sort((a, b) => toDate(b.fecha) - toDate(a.fecha))[0];

  const paint = () => {
    const items = all.filter((l) => (!st.marca || l.marca === st.marca) && (!st.estado || l.estado === st.estado) && matches(l, st.q, ['nombre', 'codigo', 'ciudad', 'direccion', 'responsable', 'marca']));
    const body = view.querySelector('#l-body');
    view.querySelector('#l-count').textContent = `${items.length} de ${all.length}`;
    if (!items.length) { body.innerHTML = `<div class="card">${empty('Ningún local coincide con la búsqueda', 'store')}</div>`; return; }
    body.innerHTML = st.view === 'tabla' ? `<div class="card table-wrap"><table class="tbl mobile-list"><thead><tr><th>Local</th><th>Código</th><th>Marca</th><th>Ciudad</th><th>Responsable</th><th>Estado</th><th>Incidencias</th><th>Última visita</th><th>Auditoría</th></tr></thead><tbody>
      ${items.map((l) => { const v = lastVisit(l.id), a = lastAudit(l.id), n = openInc(l.id); return `<tr data-href="#/locales/${l.id}">
        <td class="primary">${esc(l.nombre)} ${demoBadge(l)}</td><td class="mono">${esc(l.codigo)}</td><td>${esc(l.marca)}</td><td>${esc(l.ciudad)}</td><td class="hide-m">${esc(l.responsable)}</td>
        <td>${badge(l.estado)}</td><td>${n ? badge(`${n} abiertas`, 'red') : '<span class="subtle">0</span>'}</td><td class="hide-m">${v ? relDay(v.fecha) : '—'}</td>
        <td>${a ? `<span class="score ${scoreCls(a.puntuacion)}">${a.puntuacion}</span>` : '—'}</td></tr>`; }).join('')}
      </tbody></table></div>`
      : `<div class="cards">${items.map((l) => { const n = openInc(l.id), a = lastAudit(l.id); return `<div class="card pad click" data-href="#/locales/${l.id}">
        <div class="row between"><span class="li-icon blue">${icon('store')}</span>${badge(l.estado)}</div>
        <h3 style="margin:12px 0 2px">${esc(l.nombre)}</h3><div class="small subtle">${esc(l.marca)} · ${esc(l.codigo)} · ${esc(l.ciudad)}</div>
        <div class="row wrap" style="margin-top:12px;gap:6px">${demoBadge(l)}${n ? badge(`${n} incidencias`, 'red') : badge('Sin incidencias', 'green')}${a ? badge(`Auditoría ${a.puntuacion}`, a.puntuacion >= 85 ? 'green' : a.puntuacion >= 70 ? 'amber' : 'red') : ''}</div>
        <div class="small muted" style="margin-top:10px">${icon('user', 'sm')} ${esc(l.responsable)}</div></div>`; }).join('')}</div>`;
  };

  view.innerHTML = `
    ${pageHead('Locales', 'Ficha operativa de cada local: visitas, incidencias, auditorías, acciones y documentos.', seg('lview', [{ value: 'tabla', label: 'Tabla', icon: 'table' }, { value: 'tarjetas', label: 'Tarjetas', icon: 'grid' }], st.view))}
    ${store.all('locales').some((r) => r.demo) ? demoNotice('<b>Locales ficticios.</b> Los locales reales llegarán desde la base «Locales» de Notion. La app no crea locales para no duplicar el CRM existente.') : ''}
    <div class="toolbar" style="margin-top:14px">
      <div class="search">${icon('search', 'sm')}<input id="l-q" type="search" placeholder="Buscar por nombre, código, ciudad…" value="${esc(st.q)}"></div>
      <select class="sel" id="l-marca" aria-label="Marca"><option value="">Todas las marcas</option>${marcas.map((m) => `<option ${m === st.marca ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
      <select class="sel" id="l-estado" aria-label="Estado"><option value="">Todos los estados</option>${estados.map((m) => `<option ${m === st.estado ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
      <span class="xs subtle" id="l-count" style="margin-left:auto"></span>
    </div>
    <div id="l-body"></div>`;
  paint();
  bindSeg(view, 'lview', (v) => { st.view = v; view.querySelectorAll('[data-seg="lview"] button').forEach((b) => b.classList.toggle('on', b.dataset.val === v)); paint(); });
  view.querySelector('#l-q').addEventListener('input', debounce((e) => { st.q = e.target.value; paint(); }, 150));
  view.querySelector('#l-marca').addEventListener('change', (e) => { st.marca = e.target.value; paint(); });
  view.querySelector('#l-estado').addEventListener('change', (e) => { st.estado = e.target.value; paint(); });
}

function detail(view, id) {
  const l = store.find('locales', id);
  if (!l) { view.innerHTML = `<div class="card" style="margin-top:20px">${empty('Este local no existe o se ha eliminado', 'store')}</div>`; return; }
  const visitas = store.all('visitas').filter((v) => v.localId === id).sort((a, b) => toDate(b.fecha) - toDate(a.fecha));
  const inc = store.all('incidencias').filter((v) => v.localId === id).sort((a, b) => toDate(b.fecha) - toDate(a.fecha));
  const aud = store.all('auditorias').filter((v) => v.localId === id).sort((a, b) => toDate(b.fecha) - toDate(a.fecha));
  const tareas = store.all('tareas').filter((v) => v.localId === id && !['Hecha', 'Cancelada'].includes(v.estado));
  const docs = store.all('documentos').filter((d) => d.area === 'Locales' || d.titulo.toLowerCase().includes(l.ciudad.toLowerCase()));
  const notes = l.notas || [];
  const lastScore = aud.find((a) => a.puntuacion != null)?.puntuacion;
  const tabs = [['resumen', 'Resumen'], ['visitas', `Visitas · ${visitas.length}`], ['incidencias', `Incidencias · ${inc.length}`], ['auditorias', `Auditorías · ${aud.length}`], ['acciones', `Acciones · ${tareas.length}`], ['documentos', 'Documentos']];
  const li = (href, ic, color, title, sub, right = '') => `<div class="li" data-href="${href}"><span class="li-icon ${color}">${icon(ic, 'sm')}</span><div class="li-main"><div class="li-title">${title}</div><div class="li-sub">${sub}</div></div>${right}</div>`;
  const panes = {
    resumen: `<div class="detail-grid"><div class="stack">
        <div class="grid g3 keep2">
          <div class="card kpi"><div class="k-label">Incidencias abiertas</div><div class="k-value">${inc.filter((i) => !['Resuelta', 'Cerrada'].includes(i.estado)).length}</div></div>
          <div class="card kpi"><div class="k-label">Última auditoría</div><div class="k-value score ${scoreCls(lastScore)}">${lastScore ?? '—'}</div></div>
          <div class="card kpi"><div class="k-label">Última visita</div><div class="k-value" style="font-size:20px">${visitas[0] ? relDay(visitas[0].fecha) : '—'}</div></div>
        </div>
        <div class="card"><div class="card-h"><h3>Información relevante</h3></div><div class="card-b"><p>${esc(l.info || 'Sin información.')}</p></div></div>
        <div class="card"><div class="card-h"><h3>Notas de Alberto</h3><span class="xs subtle">Solo en este dispositivo</span></div><div class="card-b stack">
          ${notes.map((n) => `<div class="small"><span class="subtle">${fmtDate(n.at)} ·</span> ${esc(n.text)}</div>`).join('') || '<p class="small subtle">Sin notas todavía.</p>'}
          <form id="note-form" class="row"><input class="input" name="text" placeholder="Añadir nota" style="min-height:38px;font-size:15px"><button class="btn sm">Añadir</button></form>
        </div></div>
      </div>
      <div class="card pad"><dl class="props">
        <dt>Marca</dt><dd>${esc(l.marca)}</dd><dt>Código</dt><dd class="mono">${esc(l.codigo)}</dd>
        <dt>Dirección</dt><dd>${esc(l.direccion)}<br><span class="subtle">${esc(l.ciudad)}</span></dd>
        <dt>Ubicación</dt><dd><a href="https://maps.apple.com/?q=${l.lat},${l.lng}" target="_blank" rel="noopener">${icon('pin', 'sm')} Abrir en Mapas</a></dd>
        <dt>Responsable</dt><dd>${esc(l.responsable)}</dd><dt>Estado</dt><dd>${badge(l.estado)}</dd>
        <dt>Apertura</dt><dd>${fmtDateFull(l.apertura)}</dd>
        <dt>Origen</dt><dd>${l.demo ? 'Ejemplo DEMO' : 'Notion · Locales'}</dd>
      </dl>
      <div class="btn-row" style="margin-top:16px"><a class="btn primary sm" href="#/visitas/nueva/${l.id}">${icon('pin', 'sm')}Nueva visita</a><a class="btn sm" href="#/incidencias/nueva/${l.id}">${icon('alert', 'sm')}Incidencia</a><a class="btn sm" href="#/auditorias/nueva/${l.id}">${icon('audit', 'sm')}Auditoría</a></div></div>
    </div>`,
    visitas: `<div class="card"><div class="list">${visitas.map((v) => li(`#/visitas/${v.id}`, 'pin', 'green', `${esc(v.motivo)} ${demoBadge(v)}`, `${fmtDateFull(v.fecha)} · ${esc(v.responsable)}`, badge(v.resultado))).join('') || empty('Sin visitas registradas', 'pin')}</div></div>`,
    incidencias: `<div class="card"><div class="list">${inc.map((i) => li(`#/incidencias/${i.id}`, 'alert', 'red', `<span class="mono">${i.id}</span> ${esc(i.titulo)} ${demoBadge(i)}`, `${esc(i.categoria)} · ${fmtDate(i.fecha)}`, badge(i.estado))).join('') || empty('Sin incidencias', 'alert')}</div></div>`,
    auditorias: `<div class="card"><div class="list">${aud.map((a) => li(`#/auditorias/${a.id}`, 'audit', 'purple', `${esc(a.categorias.join(', '))} ${demoBadge(a)}`, `${fmtDateFull(a.fecha)} · ${esc(a.auditor)}`, a.puntuacion != null ? `<span class="score ${scoreCls(a.puntuacion)}">${a.puntuacion}</span>` : badge(a.estado))).join('') || empty('Sin auditorías', 'audit')}</div></div>`,
    acciones: `<div class="card"><div class="list">${tareas.map((t) => li(`#/tareas/${t.id}`, 'checksq', 'teal', `${esc(t.titulo)} ${demoBadge(t)}`, `${esc(t.responsable)} · ${relDay(t.limite)}`, isOverdue(t.limite, false) ? badge('Vencida', 'red') : badge(t.prioridad))).join('') || empty('Sin acciones pendientes', 'checksq')}</div></div>`,
    documentos: `<div class="card"><div class="list">${docs.map((d) => li(`#/documentacion/${d.id}`, 'doc', 'blue', `${esc(d.titulo)} ${demoBadge(d)}`, `${esc(d.area)} · ${esc(d.origen)}`)).join('') || empty('Sin documentos vinculados', 'folder')}</div></div>
      <p class="xs subtle" style="margin-top:8px">La vinculación real de documentos por local llegará con el inventario de SharePoint y OneDrive.</p>`,
  };
  view.innerHTML = `
    <div style="margin:10px 0 4px"><a href="#/locales" class="small">${icon('left', 'sm')} Locales</a></div>
    <div class="page-head"><div class="titles"><div class="row wrap"><h1>${esc(l.nombre)}</h1>${demoBadge(l)}${badge(l.estado)}</div><p>${esc(l.marca)} · ${esc(l.codigo)} · ${esc(l.direccion)}, ${esc(l.ciudad)}</p></div></div>
    <div class="tabs">${tabs.map(([k, t]) => `<button data-tab="${k}" class="${st.tab === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div id="pane">${panes[st.tab] || panes.resumen}</div>`;
  if (!view._tb) { view._tb = 1; on(view, 'click', '[data-tab]', (e, b) => { st.tab = b.dataset.tab; detail(view, id); }); }
  view.querySelector('#note-form')?.addEventListener('submit', (e) => {
    e.preventDefault(); const text = e.target.text.value.trim(); if (!text) return;
    store.update('locales', id, { notas: [{ text, at: new Date().toISOString() }, ...notes] }); toast('Nota añadida'); detail(view, id);
  });
}

export default {
  id: 'locales', title: 'Locales', icon: 'store',
  render(view, params) { if (params[0]) { detail(view, params[0]); } else { st.tab = 'resumen'; list(view); } },
};
