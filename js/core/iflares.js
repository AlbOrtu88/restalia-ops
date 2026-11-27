// Enlaces directos a iFlares (app.iflares.com), donde Restalia registra visitas, APPCC y auditorías.
// iFlares no tiene API pública: la app NO lee ni escribe en iFlares. Solo abre la pantalla adecuada
// en la web (o en la app si el iPhone la tiene asociada) con la sesión que Alberto ya tenga iniciada.
// Las rutas salen de la propia web de iFlares (aplicación de una sola página). Si cambian, basta tocar este archivo.

export const IFLARES_BASE = 'https://app.iflares.com';

const SECCIONES = {
  inicio: '/',
  procesos: '/processes/',
  auditorias: '/reports/audit',
  alertas: '/alerts/',
  comunicaciones: '/communications',
};

/** Enlace a una sección general de iFlares. */
export const iflaresUrl = (seccion = 'inicio') => IFLARES_BASE + (SECCIONES[seccion] || '/');

/**
 * Enlace a los procesos (checklists, APPCC, auditorías) de un local.
 * Usa el id del local en iFlares si se conoce (campo «iflaresId» del local); si no, abre la lista general.
 */
export function iflaresLocalUrl(l) {
  const id = l?.iflaresId;
  return id ? `${IFLARES_BASE}/processes/${encodeURIComponent(id)}` : iflaresUrl('procesos');
}
