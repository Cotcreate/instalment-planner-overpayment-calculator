// Photo storage in IndexedDB. Images are downscaled before saving to keep the device light.

const DB = 'injectatrace-photos';
let dbp;

function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('photos');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction('photos', mode);
    const out = fn(t.objectStore('photos'));
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

export const putPhoto = (id, blob) => tx('readwrite', (s) => s.put(blob, id));
export const getPhoto = (id) => tx('readonly', (s) => s.get(id));
export const deletePhoto = (id) => tx('readwrite', (s) => s.delete(id));

const urls = new Map();
export async function photoURL(id) {
  if (urls.has(id)) return urls.get(id);
  const blob = await getPhoto(id).catch(() => null);
  if (!blob) return null;
  const u = URL.createObjectURL(blob);
  urls.set(id, u);
  return u;
}
