// Cliente del backend seguro (BFF). El frontend NUNCA guarda tokens ni secretos:
// el backend custodia OAuth (Microsoft Entra ID), el token de la integración de Notion
// y la clave del proveedor de IA. El navegador solo envía la cookie de sesión.
import { getSettings } from '../core/store.js';

export class NotConnectedError extends Error {
  constructor(system, detail = '') { super(`${system}: sin conexión${detail ? ' · ' + detail : ''}`); this.name = 'NotConnectedError'; this.system = system; }
}

/**
 * Dirección del backend. Si la app se abre desde el propio Worker (*.workers.dev o el dominio indicado en
 * Configuración), el backend es el mismo origen + /api: así la cookie de sesión es de primera parte (Safari/iPhone).
 */
export function backendUrl() {
  const set = (getSettings().backendUrl || '').replace(/\/+$/, '');
  if (set) return set;
  if (location.protocol === 'https:' && /\.workers\.dev$/.test(location.hostname)) return `${location.origin}/api`;
  return '';
}
/** true cuando el backend vive en este mismo origen (cookies de primera parte). */
export const sameOrigin = () => { try { return new URL(backendUrl()).origin === location.origin; } catch { return false; } };
export const backendConfigured = () => !!backendUrl();

/** Petición al backend. Lanza NotConnectedError si no hay backend configurado. */
export async function request(path, { method = 'GET', body, system = 'Backend', timeout = 15000 } = {}) {
  const base = backendUrl();
  if (!base) throw new NotConnectedError(system, 'backend no configurado');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(base + path, {
      method, credentials: 'include', signal: ctl.signal,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401) { const d = await r.json().catch(() => ({})); throw new NotConnectedError(system, d.error || 'sesión no iniciada'); }
    if (!r.ok) { const d = await r.json().catch(() => ({})); const e = new Error(d.error || `${system}: error ${r.status}`); e.status = r.status; e.code = d.code; throw e; }
    return r.status === 204 ? null : r.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`${system}: tiempo de espera agotado`);
    if (e instanceof TypeError) throw new NotConnectedError(system, 'backend inaccesible');
    throw e;
  } finally { clearTimeout(t); }
}

/** GET /health → { notion, graph, ai, storage, push, configured } (booleanos; no exige sesión) */
export async function health() {
  try { return await request('/health', { system: 'Backend', timeout: 6000 }); } catch { return null; }
}
