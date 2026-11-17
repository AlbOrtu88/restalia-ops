// Restalia Operations AI · backend (BFF) en Cloudflare Workers.
// · /api/*  → API (sesión por cookie HttpOnly; nunca tokens en el navegador)
// · resto   → sirve la PWA publicada en GitHub Pages desde este mismo dominio, para que la cookie sea de primera parte
//             (Safari en iPhone bloquea cookies de terceros entre github.io y workers.dev).
import { json, errorResponse, HttpError, Budget, now, audit } from './util.js';
import * as auth from './auth.js';
import { notionConfigured, schema, NOTION_COLLECTIONS, dataSources } from './notion.js';
import { searchMail, searchFiles } from './graph.js';
import { runSync, syncStatus, changes, cron, ALL_SOURCES } from './sync.js';
import { chat, aiProvider } from './ai.js';
import { execute } from './approvals.js';
import { vaultGet } from './util.js';

const VERSION = '0.2.0';

async function loadCollection(env, collection, { limit = 200 } = {}) {
  const { results } = await env.DB.prepare('SELECT system, ref, data, updated_at, synced_at FROM records WHERE collection = ? AND deleted = 0 ORDER BY updated_at DESC LIMIT ?').bind(collection, limit).all();
  return results.map((r) => ({ ...JSON.parse(r.data), source: { system: r.system, ref: r.ref, updatedAt: r.updated_at, syncedAt: r.synced_at } }));
}

async function api(req, env, url) {
  const p = url.pathname.replace(/^\/api/, '') || '/';
  const m = req.method;

  // Protección CSRF: las peticiones que cambian algo deben venir de este mismo origen.
  if (m !== 'GET' && m !== 'HEAD') {
    const origin = req.headers.get('Origin');
    if (origin && origin !== url.origin) throw new HttpError(403, 'Origen no permitido');
  }

  // --- Públicos ---
  if (p === '/health' && m === 'GET') {
    const ms = await vaultGet(env, 'ms').catch(() => null);
    const { results } = await env.DB.prepare('SELECT source, last_ok, last_error FROM sync_state').all().catch(() => ({ results: [] }));
    const okFor = (prefix) => results.some((r) => r.source.startsWith(prefix) && r.last_ok && !r.last_error);
    return json({
      ok: true, version: VERSION, env: env.ENVIRONMENT, time: now(),
      notion: notionConfigured(env) && okFor('notion:'), graph: !!ms && okFor('graph:'), ai: !!aiProvider(env), storage: true, push: false,
      configured: { notion: notionConfigured(env), entra: auth.entraConfigured(env), teams: !!env.TEAMS_TEAM_ID, notionWrites: env.NOTION_WRITES_ENABLED === 'true' },
    });
  }
  if (p === '/auth/login' && m === 'GET') return auth.login(env, req, url);
  if (p === '/auth/callback' && m === 'GET') return auth.callback(env, req, url);
  if (p === '/auth/status' && m === 'GET') return auth.status(env, req);
  if (p === '/auth/key' && m === 'POST') return auth.keyLogin(env, req);
  if (p === '/auth/logout' && m === 'POST') return auth.logout(env, req);

  // --- Con sesión ---
  const session = await auth.requireSession(env, req);
  const q = url.searchParams;

  if (p === '/auth/disconnect' && m === 'POST') return auth.disconnectMicrosoft(env, session);
  if (p === '/data' && m === 'GET') return json(await changes(env, q.get('since')));
  if (p === '/sync/status' && m === 'GET') return json(await syncStatus(env));
  if (p === '/sync/run' && m === 'POST') {
    const body = await req.json().catch(() => ({}));
    if (body.source && !ALL_SOURCES.some((s) => s === body.source || s.startsWith(body.source + ':'))) throw new HttpError(400, 'Fuente desconocida');
    const res = await runSync(env, { only: body.source || null, full: !!body.full, trigger: `manual:${session.via}` });
    return json(res);
  }

  // Notion (lectura)
  if (p === '/notion/schema' && m === 'GET') {
    const budget = new Budget(30);
    const cols = Object.keys(dataSources(env));
    const out = [];
    for (const c of cols) { try { out.push(await schema(env, budget, c)); } catch (e) { out.push({ collection: c, error: e.message }); } }
    return json({ notionVersion: env.NOTION_VERSION, collections: out });
  }
  const nm = p.match(/^\/notion\/([a-zA-Z]+)$/);
  if (nm && m === 'GET') {
    const col = nm[1];
    if (!NOTION_COLLECTIONS[col]) throw new HttpError(404, 'Colección desconocida');
    return json({ items: (await loadCollection(env, NOTION_COLLECTIONS[col].app, { limit: 2000 })).filter((x) => x.source.system === 'notion') });
  }

  // Microsoft 365 (lectura). Sin q → datos sincronizados; con q → búsqueda en vivo.
  if (p === '/graph/mail' && m === 'GET') {
    if (q.get('q') || q.get('from')) return json({ items: await searchMail(env, new Budget(5), q.get('q'), { from: q.get('from'), since: q.get('since') }), live: true });
    return json({ items: (await loadCollection(env, 'mensajes', { limit: 300 })).filter((x) => x.canal === 'outlook') });
  }
  if (p === '/graph/calendar' && m === 'GET') {
    const from = q.get('from') || new Date(Date.now() - 7 * 864e5).toISOString(), to = q.get('to') || new Date(Date.now() + 60 * 864e5).toISOString();
    return json({ items: (await loadCollection(env, 'eventos', { limit: 2000 })).filter((x) => x.inicio && x.inicio >= from && x.inicio <= to) });
  }
  if (p === '/graph/teams/messages' && m === 'GET') return json({ items: (await loadCollection(env, 'mensajes', { limit: 300 })).filter((x) => x.canal === 'teams') });
  if (p === '/graph/files' && m === 'GET') {
    if (q.get('q')) return json({ items: await searchFiles(env, new Budget(5), q.get('q')), live: true });
    return json({ items: await loadCollection(env, 'documentos', { limit: 1000 }) });
  }

  if (p === '/approvals/execute' && m === 'POST') return json(await execute(env, await req.json(), session));
  if (p === '/ai/chat' && m === 'POST') return json(await chat(env, await req.json(), session));

  if (p === '/push/subscribe' && m === 'POST') {
    const sub = await req.json();
    if (!/^https:\/\//.test(sub?.endpoint || '')) throw new HttpError(400, 'Suscripción no válida');
    await env.DB.prepare('INSERT INTO push_subs (endpoint, data, created) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET data = excluded.data').bind(sub.endpoint, JSON.stringify(sub), now()).run();
    return json({ ok: true, note: 'Suscripción guardada. El envío de avisos se activará en una fase posterior.' });
  }
  if (p === '/audit' && m === 'GET') {
    const { results } = await env.DB.prepare('SELECT at, actor, action, target, result, detail FROM audit_log ORDER BY id DESC LIMIT 100').all();
    return json({ items: results });
  }
  throw new HttpError(404, 'Ruta no encontrada');
}

/** Sirve la PWA desde GitHub Pages bajo este dominio. */
async function frontend(req, env, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Método no permitido', { status: 405 });
  const origin = (env.FRONTEND_ORIGIN || '').replace(/\/+$/, '');
  if (!origin) return new Response('Sin frontend configurado', { status: 404 });
  const path = url.pathname.endsWith('/') && /raw\.githubusercontent\.com/.test(origin) ? url.pathname + 'index.html' : url.pathname;
  const r = await fetch(origin + path + url.search, { headers: { 'User-Agent': 'restalia-ops-worker' }, cf: { cacheTtl: 60 } });
  const h = new Headers(r.headers);
  // En desarrollo el frontend puede venir de raw.githubusercontent.com (rama de trabajo), que sirve todo como texto.
  const TYPES = { js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', html: 'text/html; charset=utf-8', json: 'application/json', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml' };
  const ext = url.pathname.endsWith('/') ? 'html' : (url.pathname.split('.').pop() || '').toLowerCase();
  if (/raw\.githubusercontent\.com/.test(origin) && TYPES[ext]) h.set('Content-Type', TYPES[ext]);
  ['set-cookie', 'x-github-request-id', 'x-fastly-request-id', 'via', 'x-served-by', 'x-cache', 'x-cache-hits', 'x-timer', 'access-control-allow-origin'].forEach((k) => h.delete(k));
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('X-Frame-Options', 'DENY');
  h.set('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self)');
  if (url.pathname === '/sw.js' || url.pathname === '/' || url.pathname.endsWith('.html')) h.set('Cache-Control', 'no-cache');
  return new Response(r.body, { status: r.status, headers: h });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      try { return await api(req, env, url); } catch (e) {
        if (!(e instanceof HttpError)) console.error(e);
        return errorResponse(e);
      }
    }
    return frontend(req, env, url);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(cron(env, event).catch(async (e) => { console.error('cron', e); await audit(env, 'sync.cron', { result: 'error', detail: e.message }); }));
  },
};
