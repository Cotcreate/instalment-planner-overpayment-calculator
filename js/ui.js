// Shared UI pieces: icons, wordmark, sheet, trail, toast, action bar, small helpers.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const num = (n, d = 1) => `${+(+n).toFixed(d)}`;
export const gbp = (n) => `£${(+n).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
export const gbpBig = (n) => (n >= 1e6 ? `£${+(n / 1e6).toFixed(1)}m` : n ? gbp(n) : '—');
export const date = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const dateShort = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const time = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export function ago(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

const p = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
export const I = {
  projects: p('<path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6"/>'),
  capture: p('<circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/>'),
  daily: p('<path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 12v4"/>'),
  records: p('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>'),
  dashboard: p('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  sites: p('<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M16 9h3a1 1 0 0 1 1 1v11"/><path d="M8 7h4M8 11h4M8 15h4M2 21h20"/>'),
  qa: p('<path d="M9 12l2 2 4-4"/><path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/>'),
  company: p('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>'),
  back: p('<path d="M19 12H5M11 18l-6-6 6-6"/>'),
  close: p('<path d="M18 6 6 18M6 6l12 12"/>'),
  filter: p('<path d="M3 5h18l-7 8v6l-4-2v-4z"/>'),
  camera: p('<path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>'),
  video: p('<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/>'),
  check: p('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  x: p('<path d="M18 6 6 18M6 6l12 12"/>'),
  alert: p('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'),
  upload: p('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>'),
  file: p('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
  chev: p('<path d="m9 6 6 6-6 6"/>'),
  logout: p('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>'),
  pen: p('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  clock: p('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  gps: p('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/>'),
  plus: p('<path d="M12 5v14M5 12h14"/>'),
};

export const MARK = `<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="#E8571E" d="M41 13c-7-1-12 2-18-1-4-2-7-1-10 1 4 0 6 2 9 4 5 3 11 3 19 3z"/><path fill="#F5832C" d="M41 25c-8-1-14 2-21-1-5-2-10-2-14 1 5 0 8 2 11 4 6 3 14 3 24 3z"/><path fill="#F9A65A" d="M41 37c-7-1-12 2-18-1-4-2-8-1-11 1 4 0 7 2 9 4 5 3 11 3 20 3z"/><path fill="#E8571E" d="M41 47c-5 0-9 1-13-1-3-1-5-1-7 1 3 0 4 1 6 2 4 2 8 2 14 2z"/><rect x="39" y="6" width="15" height="52" rx="2.5" fill="#F5832C"/><rect x="39" y="6" width="4" height="52" rx="2" fill="#E8571E"/></svg>`;
export const wordmark = () => `<span class="wm" aria-label="Injectatrace" role="img">${MARK}<span class="a" aria-hidden="true">njecta</span><span class="b" aria-hidden="true">trace</span></span>`;
export const traceline = (on = 3, n = 4) => `<div class="traceline" aria-hidden="true">${Array.from({ length: n }, (_, i) => `${i ? '<b></b>' : ''}<i class="${i === on ? 'on' : ''}"></i>`).join('')}</div>`;

export const qaChip = (qa) => ({
  approved: `<span class="chip c-green">${I.check}QA passed</span>`,
  pending: `<span class="chip c-red"><span class="dot"></span>Awaiting QA</span>`,
  rejected: `<span class="chip c-red">${I.x}Rework</span>`,
}[qa]);

export const expiryChip = (state, iso) => ({
  expired: `<span class="chip c-red">${I.alert}Expired ${dateShort(iso)}</span>`,
  soon: `<span class="chip c-amber">${I.clock}Expires ${dateShort(iso)}</span>`,
  ok: `<span class="chip c-green">${I.check}Valid to ${dateShort(iso)}</span>`,
  none: '<span class="chip c-slate">No expiry set</span>',
}[state]);

export function trail(steps, at) {
  const pct = (at / (steps.length - 1)) * 100;
  return `
    <div class="trail" aria-label="Step ${at + 1} of ${steps.length}: ${esc(steps[at])}">
      <div class="spread"><p class="eyebrow" style="margin:0">Step ${at + 1} of ${steps.length}</p><p class="eyebrow" style="margin:0;color:var(--navy)">${esc(steps[at])}</p></div>
      <div class="line" style="margin-top:10px" aria-hidden="true">
        <span class="fill" style="width:calc(${pct}% - ${pct / 100 * 16}px)"></span>
        ${steps.map((_, i) => `<i class="${i < at ? 'done' : i === at ? 'now' : ''}"></i>`).join('')}
      </div>
    </div>`;
}

export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}

export function setAction(main, html) {
  document.querySelector('.actionbar')?.remove();
  main.classList.toggle('has-action', !!html);
  if (!html) return null;
  const bar = document.createElement('div');
  bar.className = 'actionbar';
  bar.innerHTML = `<div class="inner">${html}</div>`;
  main.after(bar);
  return bar;
}

export function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
export function writeJSON(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* per-viewer convenience only */ }
}

// Stepper: <div class="stepper" data-stepper data-step="0.5" data-min="0" data-max="99"><button data-d="-1">…<input>…<button data-d="1"></div>
export function stepper(id, value, { step = 1, min = 0, max = 9999, label, unit = '' }) {
  return `
    <div class="stepper" data-stepper data-step="${step}" data-min="${min}" data-max="${max}" role="group" aria-label="${esc(label)}">
      <button type="button" class="btn" data-d="-1" aria-label="Decrease ${esc(label)}">−</button>
      <div class="unit" data-unit="${esc(unit)}"><input id="${id}" inputmode="decimal" value="${value ?? ''}" aria-label="${esc(label)}${unit ? ` in ${unit}` : ''}"></div>
      <button type="button" class="btn" data-d="1" aria-label="Increase ${esc(label)}">+</button>
    </div>`;
}
export function wireSteppers(root, onChange) {
  root.querySelectorAll('[data-stepper]').forEach((s) => {
    const input = s.querySelector('input');
    const { step, min, max } = Object.fromEntries(['step', 'min', 'max'].map((k) => [k, +s.dataset[k]]));
    const fire = () => onChange?.(input.id, input.value === '' ? null : +input.value);
    s.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
      const cur = input.value === '' ? min : +input.value;
      const v = Math.min(max, Math.max(min, Math.round((cur + +b.dataset.d * step) / step) * step));
      input.value = +v.toFixed(2);
      fire();
    }));
    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^\d.-]/g, '');
      fire();
    });
  });
}

// Best-effort GPS fix for the audit trail. Never blocks the user.
export function locate(timeout = 6000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    const t = setTimeout(() => resolve(null), timeout + 500);
    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(t); resolve({ lat: +pos.coords.latitude.toFixed(5), lng: +pos.coords.longitude.toFixed(5), acc: Math.round(pos.coords.accuracy) }); },
      () => { clearTimeout(t); resolve(null); },
      { enableHighAccuracy: true, timeout, maximumAge: 60000 },
    );
  });
}
export const gpsText = (g) => (g ? `${g.lat.toFixed(4)}, ${g.lng.toFixed(4)} ±${g.acc}m` : 'Location unavailable');

export function openSheet({ title, body, primary = 'Done', secondary, onPrimary, onSecondary, onOpen }) {
  const back = document.createElement('div');
  back.className = 'sheet-backdrop';
  const sheet = document.createElement('section');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'sheet-title');
  sheet.innerHTML = `
    <div class="grab" aria-hidden="true"></div>
    <header><h2 id="sheet-title">${esc(title)}</h2>
      <button type="button" class="btn iconbtn" data-close aria-label="Close">${I.close}</button></header>
    <div class="body">${body}</div>
    ${primary || secondary ? `<footer>
      ${secondary ? `<button type="button" class="btn" data-secondary>${esc(secondary)}</button>` : ''}
      ${primary ? `<button type="button" class="btn primary" data-primary>${esc(primary)}</button>` : ''}
    </footer>` : ''}`;
  const opener = document.activeElement;
  document.body.append(back, sheet);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => { back.classList.add('open'); sheet.classList.add('open'); });

  const close = () => {
    sheet.classList.remove('open');
    back.classList.remove('open');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    setTimeout(() => { back.remove(); sheet.remove(); }, 240);
    opener?.focus?.({ preventScroll: true });
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      const f = [...sheet.querySelectorAll('button, select, input, textarea, a[href], [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent);
      if (e.shiftKey && document.activeElement === f[0]) { f.at(-1).focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { f[0].focus(); e.preventDefault(); }
    }
  };
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', close);
  sheet.querySelector('[data-close]').addEventListener('click', close);
  sheet.querySelector('[data-primary]')?.addEventListener('click', async () => { if ((await onPrimary?.(sheet)) !== false) close(); });
  sheet.querySelector('[data-secondary]')?.addEventListener('click', () => onSecondary?.(sheet, close));

  // Drag the handle or header down to dismiss.
  let y0 = null;
  [sheet.querySelector('.grab'), sheet.querySelector('header')].forEach((h) => h.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    y0 = e.clientY;
    try { h.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    sheet.style.transition = 'none';
  }));
  sheet.addEventListener('pointermove', (e) => { if (y0 != null) sheet.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`; });
  sheet.addEventListener('pointerup', (e) => {
    if (y0 == null) return;
    const dy = e.clientY - y0;
    y0 = null;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > 80) close();
  });

  onOpen?.(sheet, close);
  setTimeout(() => sheet.querySelector('[data-close]').focus({ preventScroll: true }), 60);
  return close;
}

// Finger signature pad; returns { el, dataURL(), empty() }
export function signaturePad(canvas) {
  const ctx = canvas.getContext('2d');
  let drawn = false, last = null;
  const fit = () => {
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width * devicePixelRatio;
    canvas.height = r.height * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#183756';
  };
  requestAnimationFrame(fit);
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', (e) => { try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ } last = pos(e); });
  canvas.addEventListener('pointermove', (e) => {
    if (!last) return;
    const p2 = pos(e);
    ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...p2); ctx.stroke();
    last = p2; drawn = true;
    canvas.dispatchEvent(new Event('change'));
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => canvas.addEventListener(t, () => { last = null; }));
  return {
    dataURL: () => canvas.toDataURL('image/png'),
    empty: () => !drawn,
    clear: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); drawn = false; canvas.dispatchEvent(new Event('change')); },
  };
}
