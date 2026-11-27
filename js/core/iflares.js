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

/** Locales asignados a Alberto en iFlares (pantalla «Chequeos»), con su id. Leído el 27-nov-2026. */
export const IFLARES_LOCALES = [
  [2529, '100M AV DE CARLOS III EL NOBLE 38 (PAMPLONA)'],
  [3106, '100M BLUE CALLE DEL PRINCIPE 18 (MADRID)'],
  [3943, '100M BLUE CALLE MADRID 29 (GETAFE)'],
  [2666, '100M BLUE CC MAGIC BADALONA (BADALONA - BARCELONA)'],
  [2700, '100M BLUE CC MOGAN MALL (CANARIAS)'],
  [3154, '100M BLUE CC PARQUE CORREDOR (TORREJON DE ARDOZ - MADRID)'],
  [5755, '100M C/ LA MARINA 56 (BARCELONA)'],
  [2391, '100M CALLE BRAVO MURILLO 377 (MADRID)'],
  [2392, '100M CALLE BRAVO MURILLO 98 (MADRID)'],
  [4145, '100M CC 7 PALMAS (LAS PALMAS DE GRAN CANARIA)'],
  [2472, '100M CC BONAIRE (ALDAIA - VALENCIA)'],
  [2370, '100M CC HERON CITY (BARCELONA)'],
  [3952, '100M CC ITAROA (HUARTE - NAVARRA)'],
  [2522, '100M CC MERIDIANO (QUIOSCO) SANTA CRUZ DE TENERIFE'],
  [2422, '100M CC PARQUE RIVAS (RIVAS - VACIAMADRID)'],
  [2487, '100M CC PLAZA MAYOR (XATIVA)'],
  [2428, '100M CC RIVAS FUTURA (RIVAS-VACIAMADRID)'],
  [2546, '100M CC VEGA PLAZA (MOLINA DE SEGURA - MURCIA)'],
  [2527, '100M LOGROÑO'],
  [2435, '100M METROPOLITANO (MADRID)'],
  [2625, '100M PARQUE DELFIM GUIMARAES 9 (AMADORA)'],
  [2812, 'CLS CC MERIDIANO (QUIOSCO) STA CRUZ DE TENERIFE'],
  [2761, 'MLS CALLE DE CARRETAS 14 (JACINTO BENAVENTE - MADRID)'],
  [2772, 'MLS CC OCIOPIA (ORIHUELA-ALICANTE)'],
  [6009, 'MLS CC PASEO DEL MAR L-B09 (TORREVIEJA)'],
  [2757, 'MLS RAMBLA JUST OLIVERAS 1 (HOSPITALET DE LLOBREGAT)'],
  [2917, 'TGB CC BONAIRE (ALDAIA-VALENCIA)'],
  [2900, 'TGB CC PARQUE CORREDOR (TORREJON DE ARDOZ - MADRID)'],
  [2872, 'TGB GRAN VIA DE LAS CORTES CATALANAS 149 (BARCELONA)'],
  [2974, 'TGB RUA DO LOUREIRO 26-32 (SAO BENTO - OPORTO)'],
];

// Prefijo de marca en iFlares → palabras con que puede aparecer la marca en Notion.
const MARCAS = {
  '100m': ['100', 'montaditos', '100m'],
  mls: ['sureña', 'surena', 'mls', 'cls', 'cerveceria'],
  cls: ['sureña', 'surena', 'mls', 'cls', 'cerveceria'],
  tgb: ['tgb', 'good', 'burger'],
};
const VACIAS = new Set(['100m', 'mls', 'cls', 'tgb', 'blue', 'cc', 'c', 'calle', 'de', 'del', 'la', 'el', 'las', 'los', 'av', 'avenida', 'do', 'y', 'madrid', 'barcelona', 'valencia', 'quiosco', 'sta', 'santa', 'l']);
const palabras = (t) => norm(t).replace(/[^a-z0-9ñ]+/g, ' ').split(' ').filter((w) => w && !VACIAS.has(w));

/** Busca el local de iFlares que corresponde a un local de la app (por marca y nombre/dirección). Devuelve el id o null. */
export function iflaresIdFor(l) {
  if (!l) return null;
  if (l.iflaresId) return l.iflaresId;
  const texto = [l.nombre, l.direccion, l.municipio || l.ciudad, l.marca].filter(Boolean).join(' ');
  const mio = new Set(palabras(texto));
  const marcaTxt = norm([l.marca, l.nombre].filter(Boolean).join(' '));
  let best = null, bestScore = 0, second = 0;
  for (const [id, nombre] of IFLARES_LOCALES) {
    const pref = norm(nombre).split(' ')[0];
    if (marcaTxt && !(MARCAS[pref] || []).some((w) => marcaTxt.includes(w))) continue;
    const suyas = palabras(nombre);
    // Los números (portal) pesan más: distinguen Bravo Murillo 98 de 377.
    const score = suyas.reduce((s, w) => s + (mio.has(w) ? (/^\d+$/.test(w) ? 3 : 1) : 0), 0);
    if (score > bestScore) { second = bestScore; bestScore = score; best = id; } else if (score > second) second = score;
  }
  // Exige al menos dos coincidencias y que no haya empate, para no abrir el local equivocado.
  return bestScore >= 2 && bestScore > second ? best : null;
}

/** Enlace a una sección general de iFlares. */
export const iflaresUrl = (seccion = 'inicio') => IFLARES_BASE + (SECCIONES[seccion] || '/');

/** Enlace a los chequeos (PAC, auditorías, APPCC) de un local; si no se reconoce el local, la lista de chequeos. */
export function iflaresLocalUrl(l) {
  const id = iflaresIdFor(l);
  return id ? `${IFLARES_BASE}/processes/${encodeURIComponent(id)}` : iflaresUrl('chequeos');
}
