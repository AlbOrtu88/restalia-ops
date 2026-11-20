// Geocodificación gratuita de los locales (OpenStreetMap · Nominatim) para el mapa de la cartera.
// · Las coordenadas NO se escriben en Notion: se guardan en la tabla geocache de D1 y se añaden al registro del local.
// · Política de uso de Nominatim: máx. 1 petición por segundo, User-Agent identificable, resultados en caché.
//   Por eso se geocodifican pocos locales por ejecución del cron y cada dirección solo se consulta una vez.
import { now, norm, fetchRetry } from './util.js';

const UA = 'restalia-ops/0.4 (mapa interno de locales; Cloudflare Worker)';
const PER_RUN = 6; // locales por ejecución (cada uno puede necesitar hasta 3 consultas)
const RETRY_FAILED_DAYS = 7;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function ensureGeoTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS geocache (
    key TEXT PRIMARY KEY, query TEXT, lat REAL, lng REAL, precision TEXT, display TEXT, status TEXT NOT NULL, fetched_at TEXT NOT NULL)`).run();
}

/** Clave estable de una dirección: si cambia la dirección o el municipio en Notion, se vuelve a geocodificar. */
export const geoKey = (l) => norm(`${l.direccion || ''}|${l.municipio || l.ciudad || ''}`);

/** Nombre del centro comercial a partir del nombre del local («100M CC LA VAGUADA (MADRID)» → «La Vaguada») o de la dirección. */
export function centroComercial(l) {
  const from = (txt) => {
    const m = String(txt || '').match(/\b(?:CC|C\.C\.|Centro Comercial)\s+([^,(]+)/i);
    if (!m) return null;
    const name = m[1].trim();
    return name ? name.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase()) : null;
  };
  return from(l.nombre) || from(l.direccion);
}

/** Consultas de más a menos precisas. Quita partes como «local 2.08», «planta 1» o «nave 3», que confunden al buscador. */
export function geoQueries(l) {
  const muni = l.municipio || l.ciudad || '';
  const dir = String(l.direccion || '').trim();
  const out = [];
  if (dir) {
    const clean = dir.split(',').map((s) => s.trim()).filter((s) => s && !/\b(local|locales|planta|nave|puerta|bajo|piso|ptal|portal|edificio)\b/i.test(s)).join(', ');
    const withMuni = (s) => (muni && !norm(s).includes(norm(muni)) ? `${s}, ${muni}` : s);
    out.push({ q: withMuni(clean || dir), precision: 'direccion' });
    if (clean && clean !== dir) out.push({ q: withMuni(dir), precision: 'direccion' });
  }
  // Muchos locales están en centros comerciales: OpenStreetMap los conoce mejor por su nombre que por el número de la calle.
  const cc = centroComercial(l);
  if (cc) out.push({ q: muni && !norm(cc).includes(norm(muni)) ? `Centro Comercial ${cc}, ${muni}` : `Centro Comercial ${cc}`, precision: 'direccion' });
  if (muni) out.push({ q: `${muni}, España`, precision: 'municipio' });
  return out;
}

async function nominatim(env, budget, q) {
  const base = env.GEOCODER_BASE || 'https://nominatim.openstreetmap.org';
  const url = `${base}/search?format=jsonv2&limit=1&countrycodes=es&accept-language=es&q=${encodeURIComponent(q)}`;
  const r = await fetchRetry(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }, budget, { tries: 1 });
  if (!r.ok) throw new Error(`Nominatim ${r.status}`);
  const [hit] = await r.json();
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon), display: hit.display_name || null } : null;
}

/** Coordenadas en caché para un local (o null). La usa la sincronización para no perderlas al refrescar el registro. */
export async function cachedCoords(env, l) {
  const row = await env.DB.prepare("SELECT lat, lng, precision FROM geocache WHERE key = ? AND status = 'ok'").bind(geoKey(l)).first().catch(() => null);
  return row ? { lat: row.lat, lng: row.lng, geoPrecision: row.precision } : null;
}

/**
 * Geocodifica los locales que aún no tienen coordenadas. Devuelve { done, pending, failed }.
 * Respeta el presupuesto de subpeticiones y 1,1 s entre consultas.
 */
export async function geocodeLocales(env, budget, { max = PER_RUN } = {}) {
  await ensureGeoTable(env);
  const { results } = await env.DB.prepare("SELECT system, ref, data FROM records WHERE collection = 'locales' AND system = 'notion' AND deleted = 0").all();
  const todo = [];
  for (const r of results) {
    const l = JSON.parse(r.data);
    const key = geoKey(l);
    if (key === '|') continue;
    const c = await env.DB.prepare('SELECT lat, lng, precision, status, fetched_at FROM geocache WHERE key = ?').bind(key).first();
    // Las ubicaciones aproximadas (centro del municipio) se reintentan cada 7 días por si ya hay una consulta mejor.
    const approxStale = c?.status === 'ok' && c.precision === 'municipio' && Date.now() - Date.parse(c.fetched_at) >= RETRY_FAILED_DAYS * 864e5;
    if (c?.status === 'ok' && !approxStale) {
      // Ya geocodificado: si el registro no lleva las coordenadas (p. ej. tras una sincronización antigua), se añaden.
      if (l.lat !== c.lat || l.lng !== c.lng) await patchRecord(env, r.ref, l, { lat: c.lat, lng: c.lng, geoPrecision: c.precision });
      continue;
    }
    if (c?.status === 'fail' && Date.now() - Date.parse(c.fetched_at) < RETRY_FAILED_DAYS * 864e5) continue;
    todo.push({ ref: r.ref, l, key });
  }
  let done = 0, failed = 0, first = true;
  for (const { ref, l, key } of todo.slice(0, max)) {
    if (budget.left < 4) break;
    let hit = null, used = null;
    for (const cand of geoQueries(l)) {
      if (!first) await sleep(1100);
      first = false;
      try { hit = await nominatim(env, budget, cand.q); } catch (e) { console.error('geo', e.message); hit = null; }
      if (hit) { used = cand; break; }
      if (budget.left < 2) break;
    }
    if (hit) {
      await env.DB.prepare("INSERT INTO geocache (key, query, lat, lng, precision, display, status, fetched_at) VALUES (?, ?, ?, ?, ?, ?, 'ok', ?) ON CONFLICT(key) DO UPDATE SET query = excluded.query, lat = excluded.lat, lng = excluded.lng, precision = excluded.precision, display = excluded.display, status = 'ok', fetched_at = excluded.fetched_at")
        .bind(key, used.q, hit.lat, hit.lng, used.precision, hit.display, now()).run();
      await patchRecord(env, ref, l, { lat: hit.lat, lng: hit.lng, geoPrecision: used.precision });
      done++;
    } else {
      await env.DB.prepare("INSERT INTO geocache (key, query, status, fetched_at) VALUES (?, ?, 'fail', ?) ON CONFLICT(key) DO UPDATE SET status = 'fail', fetched_at = excluded.fetched_at").bind(key, geoQueries(l)[0]?.q || null, now()).run();
      failed++;
    }
  }
  return { done, failed, pending: Math.max(0, todo.length - done - failed) };
}

/** Añade las coordenadas al registro y actualiza synced_at para que la app las descargue. */
async function patchRecord(env, ref, l, coords) {
  await env.DB.prepare("UPDATE records SET data = ?, synced_at = ? WHERE system = 'notion' AND ref = ?").bind(JSON.stringify({ ...l, ...coords }), now(), ref).run();
}

/** Resumen para la app: cuántos locales tienen ubicación, cuántos aproximada y cuántos faltan. */
export async function geoStatus(env) {
  await ensureGeoTable(env);
  const { results } = await env.DB.prepare("SELECT json_extract(data, '$.lat') lat, json_extract(data, '$.geoPrecision') p FROM records WHERE collection = 'locales' AND system = 'notion' AND deleted = 0").all();
  return { total: results.length, ubicados: results.filter((r) => r.lat != null).length, aproximados: results.filter((r) => r.p === 'municipio').length };
}
