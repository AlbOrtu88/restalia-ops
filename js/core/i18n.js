// Internacionalización. Español completo; inglés preparado para la navegación y textos comunes.
// Para añadir un idioma: copiar el bloque `en`, traducir y registrar en LANGS.
const dict = {
  es: {
    'nav.trabajo': 'Mi trabajo', 'nav.operaciones': 'Operaciones', 'nav.informacion': 'Información', 'nav.sistema': 'Sistema',
    'mod.inicio': 'Inicio', 'mod.asistente': 'Mi asistente IA', 'mod.agenda': 'Agenda', 'mod.tareas': 'Tareas',
    'mod.locales': 'Locales', 'mod.visitas': 'Visitas', 'mod.auditorias': 'Auditorías', 'mod.incidencias': 'Incidencias',
    'mod.proyectos': 'Proyectos', 'mod.documentacion': 'Documentación', 'mod.comunicaciones': 'Comunicaciones',
    'mod.informes': 'Informes', 'mod.automatizaciones': 'Automatizaciones', 'mod.aprobaciones': 'Aprobaciones', 'mod.configuracion': 'Configuración',
    'tab.asistente': 'Asistente', 'tab.more': 'Más', 'quick.new': 'Registrar', 'common.local': 'Modo local',
  },
  en: {
    'nav.trabajo': 'My work', 'nav.operaciones': 'Operations', 'nav.informacion': 'Information', 'nav.sistema': 'System',
    'mod.inicio': 'Home', 'mod.asistente': 'My AI assistant', 'mod.agenda': 'Calendar', 'mod.tareas': 'Tasks',
    'mod.locales': 'Restaurants', 'mod.visitas': 'Visits', 'mod.auditorias': 'Audits', 'mod.incidencias': 'Incidents',
    'mod.proyectos': 'Projects', 'mod.documentacion': 'Documents', 'mod.comunicaciones': 'Communications',
    'mod.informes': 'Reports', 'mod.automatizaciones': 'Automations', 'mod.aprobaciones': 'Approvals', 'mod.configuracion': 'Settings',
    'tab.asistente': 'Assistant', 'tab.more': 'More', 'quick.new': 'New', 'common.local': 'Local mode',
  },
};
export const LANGS = [{ id: 'es', label: 'Español' }, { id: 'en', label: 'English (beta: navegación)' }];
let lang = 'es';
export function setLang(l) { lang = dict[l] ? l : 'es'; document.documentElement.lang = lang; }
export const t = (key, fallback) => dict[lang][key] ?? dict.es[key] ?? fallback ?? key;
