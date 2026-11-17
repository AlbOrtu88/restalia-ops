// Adaptador Microsoft Graph (capa B · datos corporativos de Microsoft 365).
// OAuth delegado (Entra ID) gestionado por el backend. Permisos mínimos sugeridos en docs/arquitectura.md
import { request } from './backend.js';

export const graph = {
  id: 'graph',
  name: 'Microsoft 365 (Graph)',
  layer: 'B',
  description: 'Outlook (correo y calendario), Teams, SharePoint y OneDrive.',
  requires: ['Registro de app en Entra ID', 'Consentimiento de permisos delegados de lectura (ChannelMessage.Read.All, de TI)', 'Iniciar sesión con Microsoft en la app conectada'],
  services: {
    mail:     { name: 'Outlook · Correo', endpoints: ['GET /me/mailFolders/inbox/messages/delta', 'GET /me/messages?$search'] },
    calendar: { name: 'Outlook · Calendario', endpoints: ['GET /me/calendarView/delta'] },
    teams:    { name: 'Teams', endpoints: ['GET /me/chats?$expand=lastMessagePreview', 'GET /teams/{id}/channels/{id}/messages'] },
    files:    { name: 'SharePoint y OneDrive', endpoints: ['GET /me/drive/root/delta', 'POST /search/query (driveItem, solo búsqueda)'] },
  },
  mail: { search: (q = '', from = '') => request(`/graph/mail?q=${encodeURIComponent(q)}&from=${encodeURIComponent(from)}`, { system: 'Outlook' }) },
  calendar: { range: (from, to) => request(`/graph/calendar?from=${from}&to=${to}`, { system: 'Outlook Calendar' }) },
  teams: { messages: () => request('/graph/teams/messages', { system: 'Teams' }) },
  files: { search: (q) => request(`/graph/files?q=${encodeURIComponent(q)}`, { system: 'SharePoint/OneDrive' }) },
  // Sin envíos: Microsoft 365 es de solo lectura. Responder correo será una fase posterior con aprobación expresa.
};
