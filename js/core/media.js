// Fotografías y evidencias en IndexedDB (no caben en localStorage).
// En la versión cloud se sustituye por el adaptador de almacenamiento (SharePoint/Blob) vía backend.
const DB = 'restalia-media';
let dbp;
function db() {
  dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction('files', mode);
    const out = fn(t.objectStore('files'));
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
  });
}
export async function putMedia(dataUrl, meta = {}) {
  const id = 'med-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  try { await tx('readwrite', (s) => s.put({ id, dataUrl, ...meta, at: new Date().toISOString() })); } catch (e) { console.warn(e); return null; }
  return id;
}
export async function getMedia(id) {
  try { const r = await tx('readonly', (s) => s.get(id)); return r?.dataUrl || null; } catch { return null; }
}
export async function deleteMedia(id) { try { await tx('readwrite', (s) => s.delete(id)); } catch {} }
/** Rellena <img data-media="id"> dentro de root */
export async function hydrateMedia(root) {
  for (const img of root.querySelectorAll('img[data-media]')) {
    const src = await getMedia(img.dataset.media);
    if (src) img.src = src; else img.alt = 'Foto no disponible en este dispositivo';
  }
}
