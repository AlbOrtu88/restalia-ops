// Sincronización: programada (Cron Triggers), bajo demanda (POST /api/sync/run) e incremental.
// Deduplicación por la pareja (system, ref). Cada registro guarda source.updatedAt y source.syncedAt.
// Notion: filtro por last_edited_time + reconciliación completa diaria (detecta páginas archivadas o borradas).
// Graph: delta queries (calendarView/delta, messages/delta, drive/root/delta) con deltaLink guardado; si caduca (410), se reinicia.
import { now, Budget, HttpError, audit } from './util.js';
import { NOTION_COLLECTIONS, dataSources, notionConfigured, query, normalize, schema } from './notion.js';
import { gfetch, mailToRecord, eventToRecord, driveItemToRecord, teamsMessageToRecord } from './graph.js';
import { vaultGet } from './util.js';

const DAY = 864e5;
export const NOTION_SOURCES = Object.keys(NOTION_COLLECTIONS).map((c) => `notion:${c}`);
export const GRAPH_SOURCES = ['graph:calendar', 'graph:mail', 'graph:teams', 'graph:files'];
export const ALL_SOURCES = [...NOTION_SOURCES, ...GRAPH_SOURCES];

async function getState(env, source) {
  return (await env.DB.prepare('SELECT * FROM sync_state WHERE source = ?').bind(source).first()) || { source, cursor: null };
}
async function setState(env, source, patch) {
  const s = { ...(await getState(env, source)), ...patch };
  await env.DB.prepare(`INSERT INTO sync_state (source, cursor, last_run, last_ok, last_full, last_error, items) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source) DO UPDATE SET cursor = excluded.cursor, last_run = excluded.last_run, last_ok = excluded.last_ok, last_full = excluded.last_full, last_error = excluded.last_error, items = excluded.items`)
    .bind(source, s.cursor ?? null, s.last_run ?? null, s.last_ok ?? null, s.last_full ?? null, s.last_error ?? null, s.items ?? 0).run();
}

/** Inserta o actualiza registros. Solo cambia synced_at si el contenido cambió (la app descarga solo lo nuevo). */
export async function upsert(env, rows) {
  if (!rows.length) return 0;
  const ts = now();
  const stmt = env.DB.prepare(`INSERT INTO records (system, ref, collection, data, updated_at, synced_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(system, ref) DO UPDATE SET collection = excluded.collection, data = excluded.data, updated_at = excluded.updated_at, synced_at = excluded.synced_at, deleted = excluded.deleted
    WHERE records.data IS NOT excluded.data OR records.deleted != excluded.deleted`);
  const batch = rows.map((r) => stmt.bind(r.system, r.ref, r.collection, JSON.stringify(r.data ?? {}), r.updatedAt ?? null, ts, r.deleted ? 1 : 0));
  for (let i = 0; i < batch.length; i += 50) await env.DB.batch(batch.slice(i, i + 50));
  return rows.length;
}

async function tombstoneMissing(env, system, collection, keepRefs) {
  const keep = new Set(keepRefs);
  const { results } = await env.DB.prepare('SELECT ref FROM records WHERE system = ? AND collection = ? AND deleted = 0').bind(system, collection).all();
  const gone = results.filter((r) => !keep.has(r.ref));
  await upsert(env, gone.map((r) => ({ system, ref: r.ref, collection, data: {}, deleted: true })));
  return gone.length;
}

// ---------- Notion ----------
async function syncNotion(env, budget, col, { full }) {
  const st = await getState(env, `notion:${col}`);
  const cur = st.cursor ? JSON.parse(st.cursor) : {};
  const isFull = full || !st.last_full || cur.mode === 'full';
  const started = cur.started || now();
  const res = await query(env, budget, col, { since: isFull ? null : st.last_ok, startCursor: cur.next });
  const app = NOTION_COLLECTIONS[col].app;
  const rows = res.pages.map((p) => ({ system: 'notion', ref: p.id, collection: app, updatedAt: p.last_edited_time, data: normalize(col, p), deleted: !!(p.archived || p.in_trash) }));
  await upsert(env, rows);
  let seen = isFull ? [...(cur.seen || []), ...res.pages.map((p) => p.id)] : [];
  if (!res.done) {
    // Se continúa en la siguiente ejecución desde el mismo punto.
    await setState(env, `notion:${col}`, { cursor: JSON.stringify({ mode: isFull ? 'full' : 'inc', next: res.next, started, seen: isFull ? seen : undefined }), last_run: now() });
    return { items: rows.length, partial: true };
  }
  let removed = 0;
  if (isFull) removed = await tombstoneMissing(env, 'notion', app, seen);
  await setState(env, `notion:${col}`, { cursor: null, last_run: now(), last_ok: started, last_full: isFull ? started : st.last_full, last_error: null, items: rows.length });
  if (isFull && budget.left > 3) await schema(env, budget, col).catch(() => {}); // refresca el informe de mapeo
  return { items: rows.length, removed };
}

// ---------- Graph: delta genérico ----------
async function runDelta(env, budget, source, startUrl, toRecord, collection, { headers = {}, keep } = {}) {
  const st = await getState(env, source);
  let url = st.cursor || startUrl();
  let n = 0, pages = 0;
  while (url && budget.left > 2 && pages < 8) {
    const r = await gfetch(env, budget, url, { headers });
    if (r.gone) { url = startUrl(); continue; } // deltaLink caducado: se reinicia
    pages++;
    const rows = [];
    for (const it of r.value || []) {
      if (it['@removed'] || it.deleted) { rows.push({ system: 'graph', ref: `${source}:${it.id}`, collection, data: {}, deleted: true }); continue; }
      if (keep && !keep(it)) continue;
      rows.push({ system: 'graph', ref: `${source}:${it.id}`, collection, updatedAt: it.lastModifiedDateTime || it.receivedDateTime || null, data: await toRecord(it) });
    }
    n += await upsert(env, rows);
    if (r['@odata.nextLink']) { url = r['@odata.nextLink']; continue; }
    if (r['@odata.deltaLink']) {
      await setState(env, source, { cursor: r['@odata.deltaLink'], last_run: now(), last_ok: now(), last_error: null, items: n });
      return { items: n };
    }
    url = null;
  }
  await setState(env, source, { cursor: url, last_run: now(), items: n });
  return { items: n, partial: true };
}

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');

async function syncCalendar(env, budget, { full }) {
  const st = await getState(env, 'graph:calendar');
  // La ventana del delta es fija: se reinicia cada 7 días para que avance (30 días atrás, 120 adelante).
  if (full || !st.last_full || Date.now() - Date.parse(st.last_full) > 7 * DAY) {
    await setState(env, 'graph:calendar', { cursor: null, last_full: now() });
    if (full || st.last_full) await env.DB.prepare("UPDATE records SET deleted = 1, synced_at = ? WHERE system = 'graph' AND ref LIKE 'graph:calendar:%' AND json_extract(data, '$.fin') < ?").bind(now(), iso(Date.now() - 30 * DAY)).run();
  }
  return runDelta(env, budget, 'graph:calendar', () => `/me/calendarView/delta?startDateTime=${iso(Date.now() - 30 * DAY)}&endDateTime=${iso(Date.now() + 120 * DAY)}`,
    eventToRecord, 'eventos', { headers: { Prefer: 'outlook.timezone="UTC", odata.maxpagesize=50' } });
}

async function syncMail(env, budget) {
  const since = iso(Date.now() - 30 * DAY);
  const sel = 'subject,from,receivedDateTime,bodyPreview,importance,webLink,flag,hasAttachments,isRead,conversationId';
  return runDelta(env, budget, 'graph:mail', () => `/me/mailFolders/inbox/messages/delta?$select=${sel}&$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}`,
    mailToRecord, 'mensajes', { headers: { Prefer: 'odata.maxpagesize=50' } });
}

async function syncFiles(env, budget) {
  const sel = 'id,name,webUrl,lastModifiedDateTime,size,file,folder,parentReference,lastModifiedBy,deleted';
  return runDelta(env, budget, 'graph:files', () => `/me/drive/root/delta?$select=${sel}`, (it) => driveItemToRecord(it, 'OneDrive'), 'documentos',
    { headers: { Prefer: 'odata.maxpagesize=200' }, keep: (it) => !!it.file });
}

async function syncTeams(env, budget) {
  const ms = await vaultGet(env, 'ms');
  const scopes = ms?.scopes || '';
  const out = { items: 0, notes: [] };
  // Canales del equipo configurado (necesita ChannelMessage.Read.All, con consentimiento de administrador).
  if (env.TEAMS_TEAM_ID && /ChannelMessage\.Read\.All/i.test(scopes)) {
    const team = await gfetch(env, budget, `/teams/${env.TEAMS_TEAM_ID}?$select=displayName`);
    const chans = await gfetch(env, budget, `/teams/${env.TEAMS_TEAM_ID}/channels?$select=id,displayName`);
    for (const c of (chans.value || []).slice(0, 10)) {
      if (budget.left < 3) { out.partial = true; break; }
      const r = await gfetch(env, budget, `/teams/${env.TEAMS_TEAM_ID}/channels/${c.id}/messages?$top=25`);
      const rows = [];
      for (const m of r.value || []) {
        if (m.messageType !== 'message' || m.deletedDateTime) { rows.push({ system: 'graph', ref: `graph:teams:${m.id}`, collection: 'mensajes', data: {}, deleted: true }); continue; }
        if (Date.parse(m.createdDateTime) < Date.now() - 30 * DAY) continue;
        rows.push({ system: 'graph', ref: `graph:teams:${m.id}`, collection: 'mensajes', updatedAt: m.lastModifiedDateTime, data: await teamsMessageToRecord(m, { team: team.displayName, channel: c.displayName, meId: ms.oid }) });
      }
      out.items += await upsert(env, rows);
    }
  } else out.notes.push(env.TEAMS_TEAM_ID ? 'Canales de Teams pendientes del consentimiento de TI (ChannelMessage.Read.All)' : 'Sin equipo de Teams configurado');
  // Chats: solo la vista previa del último mensaje de cada chat (Chat.Read).
  if (/\bChat\.Read\b/i.test(scopes) && budget.left > 2) {
    const r = await gfetch(env, budget, `/me/chats?$expand=lastMessagePreview&$top=25&$orderby=${encodeURIComponent('lastMessagePreview/createdDateTime desc')}`);
    const rows = [];
    for (const c of r.value || []) {
      const p = c.lastMessagePreview;
      if (!p || p.isDeleted || Date.parse(p.createdDateTime) < Date.now() - 30 * DAY) continue;
      rows.push({ system: 'graph', ref: `graph:chat:${c.id}`, collection: 'mensajes', updatedAt: p.createdDateTime,
        data: { ...(await teamsMessageToRecord({ ...p, id: p.id, webUrl: c.webUrl, subject: c.topic || '' }, { team: 'Chat', channel: c.topic || 'Chat', meId: ms.oid })), canalTeams: c.topic || 'Chat privado' } });
    }
    out.items += await upsert(env, rows);
  } else out.notes.push('Chats de Teams sin permiso Chat.Read');
  await setState(env, 'graph:teams', { last_run: now(), last_ok: now(), last_error: out.notes.join(' · ') || null, items: out.items });
  return out;
}

const HANDLERS = {
  'graph:calendar': syncCalendar, 'graph:mail': syncMail, 'graph:files': syncFiles, 'graph:teams': syncTeams,
};

/**
 * Ejecuta la sincronización. `only` filtra por prefijo ('notion', 'graph:mail', 'notion:tareas').
 * Procesa primero las fuentes que llevan más tiempo sin actualizarse y se detiene al agotar el presupuesto.
 */
export async function runSync(env, { only = null, full = false, trigger = 'manual', maxSubrequests = 40 } = {}) {
  const budget = new Budget(maxSubrequests);
  const ms = await vaultGet(env, 'ms');
  const sources = ALL_SOURCES.filter((s) => (!only || s === only || s.startsWith(only + ':')) &&
    (s.startsWith('notion:') ? notionConfigured(env) && dataSources(env)[s.split(':')[1]] : !!ms));
  const states = await Promise.all(sources.map((s) => getState(env, s)));
  const order = sources.map((s, i) => [s, states[i].last_run || '']).sort((a, b) => a[1].localeCompare(b[1])).map((x) => x[0]);
  const results = {};
  let graphDown = false;
  for (const s of order) {
    if (budget.left < 4) { results[s] = { skipped: 'presupuesto agotado; sigue en la próxima ejecución' }; continue; }
    if (graphDown && s.startsWith('graph:')) { results[s] = { skipped: 'Microsoft no disponible' }; continue; }
    const t0 = Date.now();
    try {
      results[s] = s.startsWith('notion:') ? await syncNotion(env, budget, s.split(':')[1], { full }) : await HANDLERS[s](env, budget, { full });
      await env.DB.prepare('INSERT INTO sync_log (at, source, trigger, ok, items, ms) VALUES (?, ?, ?, 1, ?, ?)').bind(now(), s, trigger, results[s].items || 0, Date.now() - t0).run();
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Error inesperado';
      if (!(e instanceof HttpError)) console.error(s, e);
      if (e.code === 'graph-auth') graphDown = true;
      if (e.code === 'budget') { results[s] = { skipped: 'presupuesto agotado' }; continue; }
      results[s] = { error: msg };
      await setState(env, s, { last_run: now(), last_error: msg });
      await env.DB.prepare('INSERT INTO sync_log (at, source, trigger, ok, items, ms, error) VALUES (?, ?, ?, 0, 0, ?, ?)').bind(now(), s, trigger, Date.now() - t0, msg).run();
    }
  }
  return { at: now(), trigger, results, budgetLeft: budget.left };
}

/** Limpieza diaria: registro de sincronización a 30 días, correo/Teams de más de 45 días y auditoría a 180 días. */
export async function housekeeping(env) {
  const d = (n) => new Date(Date.now() - n * DAY).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sync_log WHERE at < ?').bind(d(30)),
    env.DB.prepare("UPDATE records SET deleted = 1, data = '{}', synced_at = ? WHERE collection = 'mensajes' AND deleted = 0 AND json_extract(data, '$.fecha') < ?").bind(now(), d(45)),
    env.DB.prepare('DELETE FROM records WHERE deleted = 1 AND synced_at < ?').bind(d(60)),
    env.DB.prepare('DELETE FROM audit_log WHERE at < ?').bind(d(180)),
  ]);
}

export async function syncStatus(env) {
  const { results: states } = await env.DB.prepare('SELECT source, last_run, last_ok, last_full, last_error, items, cursor IS NOT NULL AS pending FROM sync_state').all();
  const { results: log } = await env.DB.prepare('SELECT at, source, trigger, ok, items, ms, error FROM sync_log ORDER BY id DESC LIMIT 30').all();
  const { results: counts } = await env.DB.prepare('SELECT system, collection, COUNT(*) n FROM records WHERE deleted = 0 GROUP BY system, collection').all();
  return { sources: ALL_SOURCES.map((s) => ({ source: s, ...(states.find((x) => x.source === s) || {}) })), log, counts };
}

/** Cambios desde `since` para la app (incluye borrados como deleted=true). */
export async function changes(env, since) {
  const { results } = await env.DB.prepare('SELECT system, ref, collection, data, updated_at, synced_at, deleted FROM records WHERE synced_at >= ? ORDER BY synced_at LIMIT 3000')
    .bind(since || '1970-01-01').all();
  const last = results.length ? results[results.length - 1].synced_at : since || null;
  return {
    serverTime: now(), cursor: last, more: results.length === 3000,
    records: results.map((r) => ({ system: r.system, ref: r.ref, collection: r.collection, deleted: !!r.deleted, updatedAt: r.updated_at, syncedAt: r.synced_at, data: r.deleted ? null : JSON.parse(r.data) })),
  };
}

export async function cron(env, event) {
  const daily = event.cron === '30 2 * * *';
  const res = await runSync(env, { full: daily, trigger: daily ? 'cron-diario' : 'cron' });
  if (daily) await housekeeping(env);
  await audit(env, 'sync.cron', { detail: Object.entries(res.results).map(([k, v]) => `${k}:${v.error ? 'error' : v.items ?? v.skipped}`).join(' ') });
  return res;
}
