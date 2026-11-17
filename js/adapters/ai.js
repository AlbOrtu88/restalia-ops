// Proveedor de IA intercambiable. El frontend habla con /ai/chat del backend, que elige proveedor
// (Anthropic, OpenAI, Azure OpenAI…) sin exponer claves. Sin backend se usa el motor local de demostración.
import { request, backendConfigured } from './backend.js';
import { getSettings } from '../core/store.js';

export const AI_PROVIDERS = [
  { id: 'auto', label: 'El que tenga configurado el backend (recomendado)' },
  { id: 'none', label: 'Sin IA (motor local de demostración)' },
  { id: 'anthropic', label: 'Anthropic Claude (vía backend)' },
  { id: 'openai', label: 'OpenAI (vía backend)' },
  { id: 'workers-ai', label: 'Cloudflare Workers AI (vía backend, sin clave externa)' },
];

export const aiAdapter = {
  id: 'ai',
  name: 'Proveedor de IA',
  layer: 'D',
  description: 'Genera briefings, respuestas y propuestas de acción. Intercambiable por configuración.',
  requires: ['Backend con endpoint /ai/chat', 'Clave del proveedor en el backend', 'Política de datos aprobada por Restalia'],
  isRemote: () => backendConfigured() && getSettings().aiProvider !== 'none',
  /** messages: [{role, content}], context: datos que la app decide compartir. Devuelve {content, actions[]} */
  async chat(messages, context) {
    const { aiProvider, aiModel } = getSettings();
    return request('/ai/chat', { method: 'POST', body: { provider: aiProvider, model: aiModel, messages, context }, system: 'IA', timeout: 60000 });
  },
};
