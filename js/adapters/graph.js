// Adaptador Microsoft Graph (capa B · datos corporativos de Microsoft 365).
// OAuth delegado (Entra ID) gestionado por el backend. Permisos mínimos sugeridos en docs/arquitectura.md
import { request } from './backend.js';

export const graph = {
  id: 'graph',
  name: 'Microsoft 365 (Graph)',
  layer: 'B',
  description: 'Outlook (correo y calendario), Teams, SharePoint y OneDrive.',
  requires: ['Registro de app en Entra ID (lo hace TI de Restalia)', 'Consentimiento de permisos delegados', 'Backend con flujo OAuth 2.0 + PKCE'],
  services: {
    mail:     { name: 'Outlook · Correo', endpoints: ['GET /me/messages', 'GET /me/mailFolders/inbox/messages', 'POST /me/messages/{id}/createReply (solo tras aprobación)'] },
    calendar: { name: 'Outlook · Calendario', endpoints: ['GET /me/calendarView?startDateTime&endDateTime'] },
    teams:    { name: 'Teams', endpoints: ['GET /me/chats', 'GET /teams/{id}/channels/{id}/messages', 'GET /me/onlineMeetings'] },
    files:    { name: 'SharePoint y OneDrive', endpoints: ['GET /search/query (driveItem)', 'GET /sites/{id}/drives', 'GET /me/drive/root/children'] },
  },
  mail: { list: (q = '') => request(`/graph/mail?q=${encodeURIComponent(q)}`, { system: 'Outlook' }) },
  calendar: { range: (from, to) => request(`/graph/calendar?from=${from}&to=${to}`, { system: 'Outlook Calendar' }) },
  teams: { messages: () => request('/graph/teams/messages', { system: 'Teams' }) },
  files: { search: (q) => request(`/graph/files?q=${encodeURIComponent(q)}`, { system: 'SharePoint/OneDrive' }) },
  /** Envíos: solo los ejecuta Aprobaciones tras aprobar. */
  async send(kind, payload) { return request(`/graph/${kind}/send`, { method: 'POST', body: payload, system: 'Microsoft 365' }); },
};
