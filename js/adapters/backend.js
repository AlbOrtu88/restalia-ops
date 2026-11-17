// Cliente del backend seguro (BFF). El frontend NUNCA guarda tokens ni secretos:
// el backend custodia OAuth (Microsoft Entra ID), el token de la integración de Notion
// y la clave del proveedor de IA. El navegador solo envía la cookie de sesión.
import { getSettings } from '../core/store.js';

export class NotConnectedError extends Error {
  constructor(system, detail = '') { super(`${system}: sin conexión${detail ? ' · ' + detail : ''}`); this.name = 'NotConnectedError'; this.system = system; }
}

export function backendUrl() { return (getSettings().backendUrl || '').replace(/\/+$/, ''); }
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
    if (r.status === 401) throw new NotConnectedError(system, 'sesión no iniciada');
    if (!r.ok) throw new Error(`${system}: error ${r.status}`);
    return r.status === 204 ? null : r.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`${system}: tiempo de espera agotado`);
    if (e instanceof TypeError) throw new NotConnectedError(system, 'backend inaccesible');
    throw e;
  } finally { clearTimeout(t); }
}

/** GET /health → { notion: bool, graph: bool, ai: bool } */
export async function health() {
  try { return await request('/health', { system: 'Backend', timeout: 6000 }); } catch { return null; }
}
