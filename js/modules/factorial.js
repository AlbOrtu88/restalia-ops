// Factorial: fichaje, vacaciones, tareas, compañeros y gastos con el login de Alberto (servidor MCP oficial de Factorial).
// La app nunca ve tokens: todo pasa por el backend. Lo que cambia algo en Factorial (fichar, pedir días, crear tareas)
// se confirma siempre antes de enviarse. Los tickets de gastos se guardan en este dispositivo hasta que se suben.
import { esc, uid, fmtDate, isoDate } from '../core/utils.js';
import { icon, pageHead, empty, openSheet, confirmSheet, toast, on, field, compressImage } from '../core/ui.js';
import * as store from '../core/store.js';
import { request, backendConfigured, backendUrl } from '../adapters/backend.js';
import { putMedia, getMedia, deleteMedia } from '../core/media.js';

const FACTORIAL_WEB = 'https://app.factorialhr.com/';
const GASTOS_KEY = 'restalia.gastos.v1';
let tools = null; // caché en memoria mientras la app está abierta

// ---------- Acciones conocidas (se buscan por nombre entre las que ofrece Factorial) ----------
const txt = (t) => `${t.name} ${t.title || ''}`;
const FIND = {
  clockIn: (t) => !t.readOnly && /clock.?in|check.?in|(start|begin).*(shift|attendance|clock)/i.test(txt(t)),
  clockOut: (t) => !t.readOnly && /clock.?out|check.?out|(end|stop|finish).*(shift|attendance|clock)/i.test(txt(t)),
  clockStatus: (t) => t.readOnly && /clock|attendance|shift|time.?track/i.test(txt(t)),
  leaves: (t) => t.readOnly && /leave|time.?off|absence|vacation/i.test(txt(t)) && !/type|polic|balance|allowance/i.test(txt(t)),
  balance: (t) => t.readOnly && /balance|allowance|available|remaining/i.test(txt(t)),
  leaveTypes: (t) => t.readOnly && /type/i.test(txt(t)) && /leave|time.?off|absence/i.test(txt(t)),
  requestLeave: (t) => !t.readOnly && /leave|time.?off|absence|vacation/i.test(txt(t)) && !/delete|cancel|approve|reject/i.test(txt(t)),
  tasks: (t) => t.readOnly && /task/i.test(txt(t)),
  createTask: (t) => !t.readOnly && /task/i.test(txt(t)) && !/delete/i.test(txt(t)),
  employee: (t) => t.readOnly && /employee|colleague|people|person|directory|lookup/i.test(txt(t)),
  one: (t) => /(^|[_\s-])one($|[_\s-])|factorial.?one|ask|assistant/i.test(txt(t)),
};
const find = (k) => (tools || []).find(FIND[k]);
const ES = { start_on: 'Desde', finish_on: 'Hasta', end_on: 'Hasta', start_date: 'Desde', end_date: 'Hasta', half_day: 'Medio día', leave_type_id: 'Tipo de ausencia', leave_type: 'Tipo de ausencia', description: 'Descripción', comment: 'Comentario', name: 'Nombre', title: 'Título', email: 'Email', query: 'Buscar', prompt: 'Pregunta', message: 'Mensaje', question: 'Pregunta', due_on: 'Fecha límite', due_date: 'Fecha límite', status: 'Estado' };
const fieldLabel = (name, p) => ES[name] || (p.title || name).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const label = (t) => t.title || t.name.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

// ---------- Gastos en el dispositivo ----------
const loadGastos = () => { try { return JSON.parse(localStorage.getItem(GASTOS_KEY)) || []; } catch { return []; } };
const saveGastos = (g) => { try { localStorage.setItem(GASTOS_KEY, JSON.stringify(g)); } catch { toast('No queda espacio en el dispositivo', 'alert'); } };

// ---------- Resultado de Factorial en pantalla ----------
function pretty(v) {
  if (v == null || v === '') return '<span class="subtle">—</span>';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (typeof v === 'object') return `<span class="mono xs">${esc(JSON.stringify(v).slice(0, 160))}</span>`;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(s)) return esc(s.length > 10 ? `${fmtDate(s)} · ${new Date(s).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : fmtDate(s));
  return esc(s);
}
const props = (o) => `<dl class="props">${Object.entries(o).slice(0, 12).map(([k, v]) => `<dt>${esc(k.replace(/_/g, ' '))}</dt><dd>${pretty(v)}</dd>`).join('')}</dl>`;
export function renderResult(res) {
  let data = res.structured;
  if (data == null) { try { data = JSON.parse(res.text); } catch { data = null; } }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const arr = Object.values(data).find(Array.isArray);
    if (arr && Object.keys(data).length <= 3) data = arr;
  }
  const head = res.isError ? `<div class="notice">${icon('alert')}<div>Factorial ha devuelto un error.</div></div>` : '';
  if (Array.isArray(data)) return head + (data.length ? `<div class="stack">${data.slice(0, 50).map((x) => `<div class="card" style="padding:12px">${x && typeof x === 'object' ? props(x) : pretty(x)}</div>`).join('')}</div>` : empty('Sin resultados'));
  if (data && typeof data === 'object') return head + props(data);
  return head + `<p style="white-space:pre-wrap">${esc(res.text || 'Hecho.')}</p>`;
}

// ---------- Formularios generados con el esquema de cada acción ----------
function schemaFields(schema = {}, preset = {}) {
  const req = new Set(schema.required || []);
  return Object.entries(schema.properties || {}).map(([name, p]) => {
    const base = { label: fieldLabel(name, p), name, required: req.has(name), hint: esc(String(p.description || '').slice(0, 160)), value: preset[name] ?? p.default ?? '' };
    if (Array.isArray(p.enum)) return field({ ...base, options: [...(req.has(name) ? [] : [{ value: '', label: '—' }]), ...p.enum.map(String)] });
    if (p.type === 'boolean') return field({ ...base, options: [{ value: '', label: '—' }, { value: 'true', label: 'Sí' }, { value: 'false', label: 'No' }] });
    if (p.type === 'number' || p.type === 'integer') return field({ ...base, type: 'number', attrs: p.type === 'integer' ? 'step="1"' : 'step="any"' });
    if (p.format === 'date' || /(^|_)(date|day|on)$|start_on|finish_on|end_on/i.test(name)) return field({ ...base, type: 'date' });
    if (p.format === 'date-time' || /_at$|datetime/i.test(name)) return field({ ...base, type: 'datetime-local' });
    if (p.type === 'array' || p.type === 'object') return field({ ...base, type: 'textarea', rows: 2, hint: `${base.hint} (formato JSON)` });
    return field({ ...base, type: /description|comment|note|message|prompt|question/i.test(name) ? 'textarea' : 'text' });
  }).join('');
}
function readArgs(form, schema = {}) {
  const out = {};
  for (const [name, p] of Object.entries(schema.properties || {})) {
    const el = form.elements[name];
    if (!el) continue;
    const v = String(el.value || '').trim();
    if (v === '') continue;
    if (p.type === 'boolean') out[name] = v === 'true';
    else if (p.type === 'number' || p.type === 'integer') out[name] = Number(v);
    else if (p.type === 'array' || p.type === 'object') { try { out[name] = JSON.parse(v); } catch { throw new Error(`«${name}» no es JSON válido`); } }
    else if (el.type === 'datetime-local') out[name] = new Date(v).toISOString();
    else out[name] = v;
  }
  return out;
}

async function call(tool, args = {}, confirm = false) {
  return request('/factorial/call', { method: 'POST', body: { name: tool.name, arguments: args, confirm }, system: 'Factorial', timeout: 30000 });
}

function showResult(title, res) {
  openSheet({ title, body: renderResult(res), footer: `<a class="btn" href="${FACTORIAL_WEB}" target="_blank" rel="noopener">${icon('external', 'sm')}Abrir Factorial</a><button class="btn primary" data-close>Cerrar</button>` });
}

/** Ejecuta una acción: pide los datos que necesite y, si cambia algo en Factorial, la confirma antes. */
export async function runTool(tool, { preset = {}, title = label(tool), onDone } = {}) {
  const hasInput = Object.keys(tool.inputSchema?.properties || {}).length > 0;
  const send = async (args) => {
    try {
      const res = await call(tool, args, !tool.readOnly);
      if (!tool.readOnly) toast(res.isError ? 'Factorial no lo ha aceptado' : 'Hecho en Factorial', res.isError ? 'alert' : 'check');
      showResult(title, res);
      onDone?.(res);
    } catch (e) { toast(e.message, 'alert'); }
  };
  if (!hasInput) {
    if (!tool.readOnly && !(await confirmSheet({ title, text: `Esto se hará en tu cuenta de Factorial ahora mismo: <b>${esc(title)}</b>.${tool.description ? `<br><span class="xs subtle">${esc(tool.description)}</span>` : ''}`, confirm: 'Sí, hacerlo' }))) return;
    return send({});
  }
  openSheet({
    title,
    body: `${tool.description ? `<p class="muted small" style="margin-bottom:12px">${esc(tool.description)}</p>` : ''}<form data-tool class="stack">${schemaFields(tool.inputSchema, preset)}</form>
      ${tool.readOnly ? '' : `<div class="notice" style="margin-top:12px">${icon('info')}<div>Al pulsar <b>Enviar a Factorial</b> se hará en tu cuenta. No hay paso atrás desde la app.</div></div>`}`,
    footer: `<button class="btn" data-close>Cancelar</button><button class="btn primary" data-send>${tool.readOnly ? 'Consultar' : 'Enviar a Factorial'}</button>`,
    onMount(el, close) {
      el.querySelector('[data-send]').addEventListener('click', async (e) => {
        const form = el.querySelector('form');
        if (!form.reportValidity()) return;
        let args; try { args = readArgs(form, tool.inputSchema); } catch (err) { toast(err.message, 'alert'); return; }
        e.target.disabled = true;
        close(); await send(args);
      });
    },
  });
}

// ---------- Gastos ----------
function gastoSheet(view, gasto = null) {
  const locales = store.all('locales').filter((l) => !l.demo || store.getSettings().showDemo).sort((a, b) => String(a.nombre).localeCompare(b.nombre));
  const g = gasto || { id: uid('gas'), fecha: isoDate(new Date()), importe: '', comercio: '', localId: '', nota: '', estado: 'Pendiente' };
  let media = g.mediaId || null;
  openSheet({
    title: gasto ? 'Ticket' : 'Nuevo ticket',
    body: `<form class="stack" data-g>
      <div class="field"><label>Foto o PDF del ticket *</label>
        <label class="btn" style="justify-content:center">${icon('camera', 'sm')}<span data-ph>${media ? 'Cambiar foto' : 'Hacer foto o elegir archivo'}</span><input type="file" accept="image/*,application/pdf" capture="environment" hidden data-file></label>
        <img data-prev alt="" style="max-height:180px;border-radius:10px;margin-top:8px;${media ? '' : 'display:none'}"></div>
      ${field({ label: 'Fecha', name: 'fecha', type: 'date', value: g.fecha, required: true })}
      ${field({ label: 'Importe (€)', name: 'importe', type: 'number', value: g.importe, attrs: 'step="0.01" min="0" inputmode="decimal"' })}
      ${field({ label: 'Comercio', name: 'comercio', value: g.comercio, placeholder: 'Ej. Repsol, restaurante…' })}
      ${field({ label: 'Local o visita', name: 'localId', value: g.localId, options: [{ value: '', label: '—' }, ...locales.map((l) => ({ value: l.id, label: l.nombre }))] })}
      ${field({ label: 'Nota', name: 'nota', type: 'textarea', rows: 2, value: g.nota, placeholder: 'Comida con el gerente, parking…' })}
    </form>`,
    footer: `${gasto ? `<button class="btn danger" data-del>${icon('trash', 'sm')}Borrar</button>` : ''}<button class="btn" data-close>Cancelar</button><button class="btn primary" data-save>Guardar</button>`,
    async onMount(el, close) {
      const prev = el.querySelector('[data-prev]');
      if (media) { const src = await getMedia(media); if (src?.startsWith('data:image')) prev.src = src; else prev.style.display = 'none'; }
      el.querySelector('[data-file]').addEventListener('change', async (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        try {
          let dataUrl;
          if (f.type === 'application/pdf') {
            if (f.size > 4e6) { toast('El PDF pesa demasiado (máx. 4 MB)', 'alert'); return; }
            dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
            prev.style.display = 'none';
          } else { dataUrl = await compressImage(f, 1800, 0.82); prev.src = dataUrl; prev.style.display = ''; }
          const id = await putMedia(dataUrl, { kind: 'ticket', name: f.name });
          if (!id) { toast('No se pudo guardar la foto', 'alert'); return; }
          if (media && media !== g.mediaId) deleteMedia(media);
          media = id; el.querySelector('[data-ph]').textContent = 'Cambiar foto';
        } catch { toast('No se pudo leer el archivo', 'alert'); }
      });
      el.querySelector('[data-save]').addEventListener('click', () => {
        const form = el.querySelector('form');
        if (!form.reportValidity()) return;
        if (!media) { toast('Falta la foto del ticket', 'alert'); return; }
        const d = Object.fromEntries(new FormData(form));
        const loc = locales.find((l) => l.id === d.localId);
        const next = { ...g, ...d, importe: d.importe ? Number(d.importe) : '', localNombre: loc?.nombre || '', mediaId: media };
        if (g.mediaId && g.mediaId !== media) deleteMedia(g.mediaId);
        const all = loadGastos().filter((x) => x.id !== g.id);
        saveGastos([next, ...all]);
        close(); render(view); toast('Ticket guardado en el dispositivo');
      });
      el.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!(await confirmSheet({ title: 'Borrar ticket', text: 'Se borra de este dispositivo (no de Factorial).', confirm: 'Borrar', danger: true }))) return;
        saveGastos(loadGastos().filter((x) => x.id !== g.id)); if (g.mediaId) deleteMedia(g.mediaId);
        close(); render(view);
      });
    },
  });
}

async function subirTickets(view) {
  const pend = loadGastos().filter((g) => g.estado !== 'Subido');
  if (!pend.length) { toast('No hay tickets pendientes', 'info'); return; }
  const files = [];
  for (const g of pend) {
    const src = await getMedia(g.mediaId); if (!src) continue;
    const blob = await (await fetch(src)).blob();
    const ext = blob.type === 'application/pdf' ? 'pdf' : 'jpg';
    files.push(new File([blob], `ticket-${g.fecha}-${String(g.comercio || 'gasto').replace(/[^\w-]+/g, '_').slice(0, 30)}.${ext}`, { type: blob.type }));
  }
  const resumen = pend.map((g) => `${fmtDate(g.fecha)} · ${g.importe ? g.importe.toFixed(2) + ' €' : '—'} · ${g.comercio || ''}${g.localNombre ? ' · ' + g.localNombre : ''}${g.nota ? ' · ' + g.nota : ''}`).join('\n');
  let shared = false;
  if (files.length && navigator.canShare?.({ files })) {
    try { await navigator.share({ files, title: 'Tickets de gastos', text: resumen }); shared = true; } catch (e) { if (e.name === 'AbortError') return; }
  }
  if (!shared) {
    files.forEach((f) => { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); });
    window.open(FACTORIAL_WEB, '_blank', 'noopener');
  }
  openSheet({
    title: 'Súbelos en Factorial',
    body: `<ol class="small" style="padding-left:18px;line-height:1.7">
      <li>En Factorial: <b>Mis gastos → Nuevo gasto → Subir tickets</b> (o pídeselo a <b>One</b>).</li>
      <li>Elige ${files.length === 1 ? 'el ticket' : `los ${files.length} tickets`}${shared ? ' que acabas de guardar' : ' descargados'}: Factorial lee fecha, importe y comercio solo.</li>
      <li>Revisa y envía. Aquí tienes tus notas por si las necesitas:</li></ol>
      <pre class="xs" style="white-space:pre-wrap;background:var(--surface-2,rgba(127,127,127,.08));padding:10px;border-radius:8px;margin-top:8px">${esc(resumen)}</pre>`,
    footer: `<button class="btn" data-copy>${icon('clip', 'sm')}Copiar notas</button><a class="btn" href="${FACTORIAL_WEB}" target="_blank" rel="noopener">${icon('external', 'sm')}Abrir Factorial</a><button class="btn primary" data-done>Ya los he subido</button>`,
    onMount(el, close) {
      el.querySelector('[data-copy]').addEventListener('click', async () => { try { await navigator.clipboard.writeText(resumen); toast('Notas copiadas'); } catch { toast('No se pudo copiar', 'alert'); } });
      el.querySelector('[data-done]').addEventListener('click', () => {
        const ids = new Set(pend.map((g) => g.id));
        saveGastos(loadGastos().map((g) => (ids.has(g.id) ? { ...g, estado: 'Subido', subido: new Date().toISOString() } : g)));
        close(); render(view); toast('Marcados como subidos');
      });
    },
  });
}

async function pedirAOne(g) {
  const one = find('one');
  if (!one) return;
  const prompt = `Crea un gasto reembolsable de ${g.importe ? g.importe.toFixed(2) + ' €' : 'importe por confirmar'} del ${g.fecha}${g.comercio ? ' en ' + g.comercio : ''}${g.localNombre ? ', visita al local ' + g.localNombre : ''}${g.nota ? '. Concepto: ' + g.nota : ''}. Déjalo en borrador; adjuntaré el ticket.`;
  const key = Object.keys(one.inputSchema?.properties || {}).find((k) => /prompt|message|question|query|text|input/i.test(k)) || Object.keys(one.inputSchema?.properties || {})[0];
  runTool(one, { preset: key ? { [key]: prompt } : {}, title: 'Pedir a Factorial One' });
}

// ---------- Pantalla ----------
function actionBtn(k, text, ic, primary = false) {
  const t = find(k);
  return t ? `<button class="btn ${primary ? 'primary' : ''}" data-act="${k}">${icon(ic, 'sm')}${esc(text)}</button>` : '';
}

function gastosCard() {
  const g = loadGastos();
  const pend = g.filter((x) => x.estado !== 'Subido');
  const total = pend.reduce((s, x) => s + (Number(x.importe) || 0), 0);
  return `<div class="card"><div class="card-h"><h3>${icon('camera', 'sm')} Tickets de gastos</h3><span class="xs subtle">${pend.length} pendientes${total ? ` · ${total.toFixed(2)} €` : ''}</span></div><div class="card-b">
    <p class="xs subtle" style="margin:0 0 10px">Haz la foto en la visita. Cuando quieras, súbelos todos juntos a Factorial y su IA rellena cada gasto.</p>
    <div class="row wrap" style="gap:8px;margin-bottom:10px"><button class="btn primary" data-gnew>${icon('plus', 'sm')}Nuevo ticket</button>${pend.length ? `<button class="btn" data-gup>${icon('upload', 'sm')}Subir ${pend.length} a Factorial</button>` : ''}</div>
    ${g.length ? `<div class="list">${g.slice(0, 30).map((x) => `<div class="li" data-g="${esc(x.id)}"><span class="li-icon ${x.estado === 'Subido' ? 'green' : 'amber'}">${icon(x.estado === 'Subido' ? 'check' : 'camera')}</span>
      <div class="li-main"><div class="li-title">${x.importe ? x.importe.toFixed(2) + ' €' : 'Sin importe'} · ${esc(x.comercio || 'Ticket')}</div><div class="li-sub">${fmtDate(x.fecha)}${x.localNombre ? ' · ' + esc(x.localNombre) : ''} · ${esc(x.estado)}</div></div>
      ${find('one') && x.estado !== 'Subido' ? `<button class="btn ghost sm" data-gone="${esc(x.id)}" title="Pedir a Factorial One">${icon('sparkles', 'sm')}</button>` : ''}${icon('right', 'sm')}</div>`).join('')}</div>` : empty('Aún no hay tickets', 'camera')}
  </div></div>`;
}

function render(view) {
  const hash = location.hash.split('?')[1];
  if (hash) {
    const q = new URLSearchParams(hash);
    if (q.get('fc') === 'ok') toast('Factorial conectado', 'check');
    if (q.get('fc') === 'error') toast(q.get('msg') || 'No se pudo conectar con Factorial', 'alert');
    history.replaceState(null, '', '#/factorial');
  }
  view.innerHTML = `${pageHead('Factorial', 'Fichaje, vacaciones, tareas y gastos con tu propia cuenta de Factorial.')}
    <div class="stack" style="margin-top:14px" data-body><div class="card"><p class="small subtle">Cargando Factorial…</p></div></div>`;
  const body = view.querySelector('[data-body]');

  if (!backendConfigured()) {
    body.innerHTML = `<div class="notice">${icon('plug')}<div>Factorial necesita el backend. Abre la app desde su dirección conectada.</div></div>${gastosCard()}`;
    bindGastos(view, body); return;
  }

  request('/factorial/status', { system: 'Factorial' }).then(async (st) => {
    if (!st.connected) {
      body.innerHTML = `<div class="card"><div class="card-h"><h3>${icon('plug', 'sm')} Conectar con Factorial</h3></div><div class="card-b">
        <p class="small" style="margin:0 0 12px">Entras una vez con <b>tu usuario de Factorial</b>. La app solo puede hacer lo que tú ya puedes hacer allí, y te pide confirmación antes de fichar, pedir días o crear algo. No hace falta clave de API ni permiso de TI.</p>
        <a class="btn primary" href="${esc(backendUrl())}/factorial/connect">${icon('link', 'sm')}Conectar con Factorial</a></div></div>${gastosCard()}`;
      bindGastos(view, body); return;
    }
    try { tools = (await request('/factorial/tools', { system: 'Factorial', timeout: 30000 })).tools; } catch (e) {
      body.innerHTML = `<div class="notice">${icon('alert')}<div>${esc(e.message)}</div></div>${e.code === 'factorial-auth' ? `<a class="btn primary" href="${esc(backendUrl())}/factorial/connect">${icon('link', 'sm')}Volver a conectar</a>` : ''}${gastosCard()}`;
      bindGastos(view, body); return;
    }
    const used = new Set(Object.keys(FIND).map((k) => find(k)?.name).filter(Boolean));
    body.innerHTML = `
      <div class="card"><div class="card-h"><h3>${icon('clock', 'sm')} Fichaje</h3><span class="xs subtle" data-clock></span></div><div class="card-b">
        <div class="row wrap" style="gap:8px">${actionBtn('clockIn', 'Fichar entrada', 'play', true)}${actionBtn('clockOut', 'Fichar salida', 'x')}${actionBtn('clockStatus', '¿Estoy fichado?', 'clock')}</div>
        ${find('clockIn') || find('clockOut') ? '' : '<p class="xs subtle" style="margin-top:8px">Tu cuenta de Factorial no ofrece fichaje por aquí.</p>'}</div></div>
      <div class="card"><div class="card-h"><h3>${icon('calendar', 'sm')} Vacaciones y ausencias</h3></div><div class="card-b">
        <div class="row wrap" style="gap:8px">${actionBtn('requestLeave', 'Pedir días', 'plus', true)}${actionBtn('leaves', 'Mis ausencias', 'calendar')}${actionBtn('balance', 'Días disponibles', 'chart')}${actionBtn('leaveTypes', 'Tipos de ausencia', 'list')}</div></div></div>
      ${find('tasks') || find('createTask') ? `<div class="card"><div class="card-h"><h3>${icon('checksq', 'sm')} Tareas de Factorial</h3></div><div class="card-b"><div class="row wrap" style="gap:8px">${actionBtn('tasks', 'Mis tareas', 'list')}${actionBtn('createTask', 'Nueva tarea', 'plus')}</div></div></div>` : ''}
      ${find('employee') ? `<div class="card"><div class="card-h"><h3>${icon('users', 'sm')} Compañeros</h3></div><div class="card-b"><div class="row wrap" style="gap:8px">${actionBtn('employee', 'Buscar compañero', 'search')}</div></div></div>` : ''}
      ${find('one') ? `<div class="card"><div class="card-h"><h3>${icon('sparkles', 'sm')} Preguntar a Factorial One</h3></div><div class="card-b"><p class="xs subtle" style="margin:0 0 8px">Políticas, contrato, gastos… Solo funciona si vuestro plan incluye One y gasta sus créditos.</p>${actionBtn('one', 'Preguntar', 'chat')}</div></div>` : ''}
      ${gastosCard()}
      <details class="card card-b"><summary class="small" style="cursor:pointer;font-weight:600">Todas las acciones de Factorial (${tools.length})</summary>
        <div class="list" style="margin-top:8px">${tools.map((t) => `<div class="li" data-tool="${esc(t.name)}"><span class="li-icon ${t.readOnly ? 'blue' : 'amber'}">${icon(t.readOnly ? 'search' : 'edit')}</span><div class="li-main"><div class="li-title">${esc(label(t))}${used.has(t.name) ? '' : ''}</div><div class="li-sub">${t.readOnly ? 'Consulta' : 'Cambia datos · pide confirmación'}${t.description ? ' · ' + esc(t.description.slice(0, 90)) : ''}</div></div>${icon('right', 'sm')}</div>`).join('')}</div>
        <div class="row wrap" style="gap:8px;margin-top:10px"><button class="btn sm" data-refresh>${icon('refresh', 'sm')}Actualizar acciones</button><button class="btn sm" data-disc>${icon('x', 'sm')}Desconectar Factorial</button></div>
      </details>`;
    on(body, 'click', '[data-act]', (e, b) => {
      const k = b.dataset.act, t = find(k);
      runTool(t, { title: b.textContent.trim(), onDone: k.startsWith('clock') ? () => clockStatus(body) : undefined });
    });
    on(body, 'click', '[data-tool]', (e, el) => { const t = tools.find((x) => x.name === el.dataset.tool); if (t) runTool(t); });
    body.querySelector('[data-refresh]')?.addEventListener('click', async () => { try { tools = (await request('/factorial/tools?fresh=1', { system: 'Factorial', timeout: 30000 })).tools; render(view); toast('Acciones actualizadas'); } catch (e) { toast(e.message, 'alert'); } });
    body.querySelector('[data-disc]')?.addEventListener('click', async () => {
      if (!(await confirmSheet({ title: 'Desconectar Factorial', text: 'La app olvida tu conexión. Podrás volver a conectar cuando quieras.', confirm: 'Desconectar', danger: true }))) return;
      try { await request('/factorial/disconnect', { method: 'POST', body: {}, system: 'Factorial' }); render(view); } catch (e) { toast(e.message, 'alert'); }
    });
    bindGastos(view, body);
    clockStatus(body);
  }).catch((e) => { body.innerHTML = `<div class="notice">${icon('alert')}<div>${esc(e.message)}</div></div>${gastosCard()}`; bindGastos(view, body); });
}

/** Muestra el estado del fichaje (solo lectura) junto al título. */
async function clockStatus(body) {
  const t = find('clockStatus'); const el = body.querySelector('[data-clock]');
  if (!t || !el || Object.keys(t.inputSchema?.properties || {}).some((k) => (t.inputSchema.required || []).includes(k))) return;
  try {
    const res = await call(t, {});
    let d = res.structured; if (d == null) { try { d = JSON.parse(res.text); } catch { d = null; } }
    const flag = d && typeof d === 'object' ? Object.entries(d).find(([k, v]) => typeof v === 'boolean' && /clock|in|open|active|working/i.test(k)) : null;
    el.textContent = flag ? (flag[1] ? '● Fichado ahora' : 'Sin fichar') : String(res.text || '').slice(0, 60);
  } catch { el.textContent = ''; }
}

function bindGastos(view, body) {
  body.querySelector('[data-gnew]')?.addEventListener('click', () => gastoSheet(view));
  body.querySelector('[data-gup]')?.addEventListener('click', () => subirTickets(view));
  on(body, 'click', '[data-gone]', (e, b) => { e.stopPropagation(); const g = loadGastos().find((x) => x.id === b.dataset.gone); if (g) pedirAOne(g); });
  on(body, 'click', '[data-g]', (e, el) => { if (e.target.closest('[data-gone]')) return; const g = loadGastos().find((x) => x.id === el.dataset.g); if (g) gastoSheet(view, g); });
}

export default { id: 'factorial', title: 'Factorial', icon: 'clock', render };
