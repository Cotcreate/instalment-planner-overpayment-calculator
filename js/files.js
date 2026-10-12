// File storage in IndexedDB: photos, video and documents. Photos are downscaled before saving.

const DB = 'injectatrace-files';
let dbp;

function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction('files', mode);
    const out = fn(t.objectStore('files'));
    t.oncomplete = () => resolve(out?.result);
    t.onerror = () => reject(t.error);
  });
}

export async function downscale(file, max = 1600, quality = 0.75) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
}

export const putFile = (id, blob) => tx('readwrite', (s) => s.put(blob, id));
export const getFile = (id) => tx('readonly', (s) => s.get(id));
export const deleteFile = (id) => tx('readwrite', (s) => s.delete(id));

const urls = new Map();
export async function fileURL(id) {
  if (!id) return null;
  if (urls.has(id)) return urls.get(id);
  const blob = await getFile(id).catch(() => null);
  if (!blob) return null;
  const u = URL.createObjectURL(blob);
  urls.set(id, u);
  return u;
}
