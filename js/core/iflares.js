// Enlaces directos a iFlares (app.iflares.com), donde Restalia registra visitas, APPCC y auditorías.
// iFlares no tiene API pública: la app NO lee ni escribe en iFlares. Solo abre la pantalla adecuada
// en la web con la sesión que Alberto ya tenga iniciada.
// Rutas comprobadas el 27-nov-2026 con la sesión de Alberto: «Chequeos» = /processes y cada local = /processes/<id>.
// Si iFlares cambia las rutas o los locales asignados, basta tocar este archivo.
import { norm } from './utils.js';

export const IFLARES_BASE = 'https://app.iflares.com';

const SECCIONES = {
  inicio: '/',
  chequeos: '/processes',
  reportes: '/reports/',
  avisos: '/alerts/',
};

/**
 * Cartera de Alberto (25 locales) con su id en iFlares: [código Restalia, nombre en iFlares, id en iFlares].
 * Nombres cruzados el 27-nov-2026 con la lista completa de locales de iFlares (24 iguales; San Miguel del Camino
 * figura en iFlares como «(FUENCARRAL)»). Si cambia la cartera, se actualiza aquí.
 */
export const IFLARES_LOCALES = [
  ['0032', '100M CC EQUINOCCIO PARK (MAJADAHONDA)', 2411],
  ['0039', '100M CC PLAZA NORTE 2 (SAN SEBASTIAN DE LOS REYES - MADRID)', 2425],
  ['0052', '100M CC VIALIA (SALAMANCA)', 2366],
  ['0105', '100M CC VALLSUR (VALLADOLID)', 2365],
  ['0116', '100M CC LOS VALLES (COLLADO VILLALBA - MADRID)', 2419],
  ['0240', '100M CC GRAN PLAZA 2 (MAJADAHONDA)', 2413],
  ['0322', '100M CALLE ESTRADA 1 (AVILA)', 2360],
  ['0330', '100M CALLE DE FERNANDO EL CATOLICO 84 (MADRID)', 2393],
  ['0347', '100M PLAZA DEL VAL 6 (VALLADOLID)', 2367],
  ['0417', '100M CALLE PRINCIPE CARLOS 40 (SANCHINARRO)', 2407],
  ['0441', '100M VIA DE LAS DOS CASTILLAS 15 (POZUELO DE ALARCON)', 2451],
  ['0544', '100M CC LA VAGUADA (MADRID)', 2418],
  ['0581', '100M C/ FRANCOS RODRIGUEZ 69 (MADRID)', 4592],
  ['0587', '100M C/ GRAN VIA 5 (MAJADAHONDA - MADRID)', 5410],
  ['0614', '100M CALLE DE SAN MIGUEL DEL CAMINO 16 (FUENCARRAL - LAS TABLAS)', 5962],
  ['0623', '100M PLAZA ESPAÑA (LAS ROZAS)', 6235],
  ['3049', 'MLS CC CIUDAD TRES CANTOS (MADRID)', 2764],
  ['3089', 'MLS CC MONTECARMELO (MADRID)', 4149],
  ['BL0037', '100M BLUE CC EL VENTANAL DE LA SIERRA (COLMENAR VIEJO - MADRID)', 2672],
  ['BL0082', '100M BLUE CC PLANETOCIO (COLLADO VILLALBA - MADRID)', 3155],
  ['CLS2105', 'CLS CALLE CONCEPCION 1 (VALLADOLID)', 2792],
  ['CLS2146', 'CLS CC LA VAGUADA (MADRID)', 2799],
  ['TGB0001', 'TGB CC LA VAGUADA (MADRID)', 2896],
  ['TGB0033', 'TGB CC PLANETOCIO (COLLADO VILLALBA)', 2902],
  ['TGB0208', 'TGB CC CIUDAD TRES CANTOS (TRES CANTOS - MADRID)', 2890],
];

const clave = (t) => norm(t).replace(/[^a-z0-9n]+/g, ' ').trim();
const POR_CODIGO = new Map(IFLARES_LOCALES.map(([c, , id]) => [clave(c), id]));
const POR_NOMBRE = new Map(IFLARES_LOCALES.map(([, n, id]) => [clave(n), id]));

/** Id en iFlares de un local de la app: por su código Restalia y, si no, por su nombre exacto. Si no es de la cartera, null. */
export function iflaresIdFor(l) {
  if (!l) return null;
  if (l.iflaresId) return l.iflaresId;
  const cod = l.codigo != null ? clave(String(l.codigo)) : '';
  if (cod) {
    if (POR_CODIGO.has(cod)) return POR_CODIGO.get(cod);
    // Códigos numéricos que Notion pueda guardar sin ceros a la izquierda (32 → 0032).
    if (/^\d+$/.test(cod) && POR_CODIGO.has(cod.padStart(4, '0'))) return POR_CODIGO.get(cod.padStart(4, '0'));
  }
  return POR_NOMBRE.get(clave(l.nombre || '')) ?? null;
}

/** Enlace a una sección general de iFlares. */
export const iflaresUrl = (seccion = 'inicio') => IFLARES_BASE + (SECCIONES[seccion] || '/');

/** Enlace a los chequeos (PAC, auditorías, APPCC) de un local; si no se reconoce el local, la lista de chequeos. */
export function iflaresLocalUrl(l) {
  const id = iflaresIdFor(l);
  return id ? `${IFLARES_BASE}/processes/${encodeURIComponent(id)}` : iflaresUrl('chequeos');
}
