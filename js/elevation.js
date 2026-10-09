// Elevation drawing: pinch to zoom, drag to pan, tap to drop a pin, confirm before it sticks.
// Big +/− buttons too, because pinching in gloves is unreliable.
import { floorAt, bayAt } from './store.js';

const BAY = 64, FLOOR = 48, ML = 48, MT = 28, MR = 16, MB = 34;
const TAP_SLOP = 10;   // px of movement before a touch counts as a drag
const TAP_MS = 450;
const PIN_SVG = '<svg viewBox="0 0 30 40" aria-hidden="true"><path d="M15 39C15 39 2 23 2 14a13 13 0 0 1 26 0c0 9-13 25-13 25z" fill="#FF6A13" stroke="#0B1F3A" stroke-width="2.5"/><circle cx="15" cy="14" r="5" fill="#0B1F3A"/></svg>';
export const pinIcon = PIN_SVG;

function drawing(el) {
  const fw = el.bays * BAY, fh = el.floors * FLOOR;
  const W = ML + fw + MR, H = MT + fh + MB;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${el.name} elevation, ${el.floors} floors, ${el.bays} bays">`;
  s += `<rect x="${ML - 6}" y="${MT - 10}" width="${fw + 12}" height="10" fill="#0B1F3A"/>`;
  s += `<rect x="${ML}" y="${MT}" width="${fw}" height="${fh}" fill="#E4E8EE" stroke="#0B1F3A" stroke-width="2"/>`;
  for (let f = 0; f < el.floors; f++) {
    const y = MT + f * FLOOR;
    if (f) s += `<line x1="${ML}" y1="${y}" x2="${ML + fw}" y2="${y}" stroke="#9AA6B8" stroke-width="1.5"/>`;
    const lvl = el.floors - f - 1;
    s += `<text x="${ML - 10}" y="${y + FLOOR / 2 + 5}" text-anchor="end" font-size="13" font-weight="700" fill="#33415A">${lvl === 0 ? 'G' : 'L' + lvl}</text>`;
    for (let b = 0; b < el.bays; b++) {
      const x = ML + b * BAY;
      const isDoor = f === el.floors - 1 && b === Math.floor(el.bays / 2);
      s += isDoor
        ? `<rect x="${x + 18}" y="${y + 10}" width="28" height="${FLOOR - 10}" fill="#16335C"/>`
        : `<rect x="${x + 12}" y="${y + 10}" width="${BAY - 24}" height="${FLOOR - 20}" fill="#B9C9DE" stroke="#16335C" stroke-width="1.5"/>`;
    }
  }
  for (let b = 0; b <= el.bays; b++) {
    const x = ML + b * BAY;
    s += `<line x1="${x}" y1="${MT}" x2="${x}" y2="${MT + fh}" stroke="#16335C" stroke-width="${b % el.bays === 0 ? 0 : 1}" stroke-dasharray="4 4"/>`;
    if (b < el.bays) s += `<text x="${x + BAY / 2}" y="${MT + fh + 22}" text-anchor="middle" font-size="13" font-weight="700" fill="#33415A">${b + 1}</text>`;
  }
  s += `<line x1="${ML - 30}" y1="${MT + fh}" x2="${ML + fw + 10}" y2="${MT + fh}" stroke="#0B1F3A" stroke-width="3"/>`;
  s += '</svg>';
  return { svg: s, W, H, fx: ML, fy: MT, fw, fh };
}

/**
 * mountElevation(host, opts)
 *  el: elevation {name, floors, bays}
 *  pins: [{id, x, y, status}] existing records (0..1 facade coords)
 *  editable: tap places a pin (with confirm). Otherwise tap selects an existing pin.
 *  value: {x, y} already-confirmed pin
 *  onConfirm({x, y, floor, bay}), onSelect(id)
 */
export function mountElevation(host, { el, pins = [], editable = false, value = null, onConfirm, onSelect }) {
  const d = drawing(el);
  host.innerHTML = `
    <div class="elev">
      <div class="elev-view ${editable ? '' : 'readonly'}" tabindex="0"
           aria-label="${el.name} elevation drawing. ${editable ? 'Tap to place a pin, or press Enter to place one at the centre.' : 'Tap a dot to see the record.'} Arrow keys pan, plus and minus zoom.">
        <div class="elev-stage">${d.svg}</div>
        <div class="elev-pins"></div>
        <div class="elev-hint"><span>${editable ? 'Pinch or + / − to zoom · Tap to drop pin' : 'Pinch or + / − to zoom · Tap a dot'}</span></div>
        <div class="elev-tools">
          <button type="button" class="btn dark" data-z="in" aria-label="Zoom in">+</button>
          <button type="button" class="btn dark" data-z="out" aria-label="Zoom out">−</button>
          <button type="button" class="btn" data-z="fit" aria-label="Fit drawing to screen"><svg viewBox="0 0 24 24"><path d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z"/></svg></button>
        </div>
        <div class="elev-confirm" hidden role="dialog" aria-label="Confirm pin">
          <p></p>
          <div class="row">
            <button type="button" class="btn" data-c="cancel">Cancel</button>
            <button type="button" class="btn primary" data-c="ok">Confirm pin</button>
          </div>
        </div>
      </div>
    </div>`;

  const view = host.querySelector('.elev-view');
  const stage = host.querySelector('.elev-stage');
  const layer = host.querySelector('.elev-pins');
  const confirmBox = host.querySelector('.elev-confirm');
  const hint = host.querySelector('.elev-hint');

  let s = 1, tx = 0, ty = 0, minS = 0.2, maxS = 4, fitted = false;
  let confirmed = value ? { ...value } : null;
  let pending = null;
  let selected = null;

  const vw = () => view.clientWidth, vh = () => view.clientHeight;

  function fit() {
    if (!vw() || !vh()) return;
    const k = Math.min(vw() / d.W, vh() / d.H) * 0.94;
    minS = k * 0.8; maxS = Math.max(k * 6, 2.5);
    s = k;
    tx = (vw() - d.W * s) / 2;
    ty = (vh() - d.H * s) / 2;
    fitted = true;
    apply();
  }

  function clamp() {
    const cw = d.W * s, ch = d.H * s, pad = 60;
    const minX = Math.min(vw() - cw, (vw() - cw) / 2) - pad, maxX = Math.max(0, (vw() - cw) / 2) + pad;
    const minY = Math.min(vh() - ch, (vh() - ch) / 2) - pad, maxY = Math.max(0, (vh() - ch) / 2) + pad;
    tx = Math.min(maxX, Math.max(minX, tx));
    ty = Math.min(maxY, Math.max(minY, ty));
  }

  function apply() {
    clamp();
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    drawPins();
  }

  function zoomAt(px, py, ns) {
    ns = Math.min(maxS, Math.max(minS, ns));
    const cx = (px - tx) / s, cy = (py - ty) / s;
    s = ns;
    tx = px - cx * s;
    ty = py - cy * s;
    apply();
  }

  const toScreen = (p) => [tx + (d.fx + p.x * d.fw) * s, ty + (d.fy + p.y * d.fh) * s];
  function toFacade(px, py) {
    const x = ((px - tx) / s - d.fx) / d.fw;
    const y = ((py - ty) / s - d.fy) / d.fh;
    return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
  }

  function drawPins() {
    let html = '';
    for (const p of pins) {
      const [x, y] = toScreen(p);
      html += `<div class="pin other ${p.status}${p.id === selected ? ' sel' : ''}" style="left:${x}px;top:${y}px"></div>`;
    }
    if (confirmed && !pending) {
      const [x, y] = toScreen(confirmed);
      html += `<div class="pin" style="left:${x}px;top:${y}px">${PIN_SVG}</div>`;
    }
    if (pending) {
      const [x, y] = toScreen(pending);
      html += `<div class="pin pending" style="left:${x}px;top:${y}px">${PIN_SVG}</div>`;
    }
    layer.innerHTML = html;
  }

  const where = (p) => `${floorAt(el, p.y)}, bay ${bayAt(el, p.x)}`;

  function propose(p) {
    pending = p;
    confirmBox.querySelector('p').textContent = `Pin at ${where(p)}?`;
    confirmBox.hidden = false;
    hint.hidden = true;
    drawPins();
    confirmBox.querySelector('[data-c="ok"]').focus({ preventScroll: true });
  }

  function closeConfirm() {
    pending = null;
    confirmBox.hidden = true;
    hint.hidden = false;
    drawPins();
  }

  function tap(px, py) {
    if (editable) {
      const p = toFacade(px, py);
      if (p) propose(p);
      return;
    }
    let best = null, bd = 28 * 28;
    for (const p of pins) {
      const [x, y] = toScreen(p);
      const dd = (x - px) ** 2 + (y - py) ** 2;
      if (dd < bd) { bd = dd; best = p; }
    }
    selected = best?.id ?? null;
    drawPins();
    onSelect?.(selected);
  }

  // ---- Pointer gestures ----
  const pts = new Map();
  let gesture = null;

  const local = (e) => {
    const r = view.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const isUI = (e) => e.target.closest('.elev-tools, .elev-confirm');

  view.addEventListener('pointerdown', (e) => {
    if (isUI(e)) return;
    try { view.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
    pts.set(e.pointerId, local(e));
    if (pts.size === 1) {
      const [x, y] = pts.get(e.pointerId);
      gesture = { kind: 'pan', x0: x, y0: y, tx0: tx, ty0: ty, t0: Date.now(), tap: true };
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      gesture = {
        kind: 'pinch', d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, s0: s,
        cx: ((a[0] + b[0]) / 2 - tx) / s, cy: ((a[1] + b[1]) / 2 - ty) / s, tap: false,
      };
    }
  });

  view.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId) || !gesture) return;
    pts.set(e.pointerId, local(e));
    if (gesture.kind === 'pan' && pts.size === 1) {
      const [x, y] = pts.get(e.pointerId);
      const dx = x - gesture.x0, dy = y - gesture.y0;
      if (gesture.tap && Math.hypot(dx, dy) < TAP_SLOP) return;
      gesture.tap = false;
      tx = gesture.tx0 + dx; ty = gesture.ty0 + dy;
      apply();
    } else if (gesture.kind === 'pinch' && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      s = Math.min(maxS, Math.max(minS, gesture.s0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / gesture.d0));
      tx = mx - gesture.cx * s;
      ty = my - gesture.cy * s;
      apply();
    }
  });

  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    const pos = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    if (gesture?.kind === 'pan' && gesture.tap && e.type === 'pointerup' && Date.now() - gesture.t0 < TAP_MS) tap(...pos);
    if (pts.size === 1) {
      // One finger left after a pinch: continue as a pan, never a tap.
      const [x, y] = [...pts.values()][0];
      gesture = { kind: 'pan', x0: x, y0: y, tx0: tx, ty0: ty, t0: 0, tap: false };
    } else if (!pts.size) gesture = null;
  };
  view.addEventListener('pointerup', end);
  view.addEventListener('pointercancel', end);

  view.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [x, y] = local(e);
    zoomAt(x, y, s * Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  view.addEventListener('keydown', (e) => {
    if (isUI(e)) return;
    const step = 40;
    const map = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (map[e.key]) { tx += map[e.key][0]; ty += map[e.key][1]; apply(); e.preventDefault(); }
    else if (e.key === '+' || e.key === '=') zoomAt(vw() / 2, vh() / 2, s * 1.4);
    else if (e.key === '-') zoomAt(vw() / 2, vh() / 2, s / 1.4);
    else if (e.key === 'Enter' && editable) { tap(vw() / 2, vh() / 2); e.preventDefault(); }
    else if (e.key === 'Escape' && pending) closeConfirm();
  });

  host.querySelector('.elev-tools').addEventListener('click', (e) => {
    const z = e.target.closest('[data-z]')?.dataset.z;
    if (z === 'in') zoomAt(vw() / 2, vh() / 2, s * 1.5);
    if (z === 'out') zoomAt(vw() / 2, vh() / 2, s / 1.5);
    if (z === 'fit') fit();
  });

  confirmBox.addEventListener('click', (e) => {
    const c = e.target.closest('[data-c]')?.dataset.c;
    if (c === 'ok' && pending) {
      confirmed = pending;
      const out = { x: confirmed.x, y: confirmed.y, floor: floorAt(el, confirmed.y), bay: bayAt(el, confirmed.x) };
      closeConfirm();
      onConfirm?.(out);
    } else if (c === 'cancel') closeConfirm();
  });

  const ro = new ResizeObserver(() => (fitted ? apply() : fit()));
  ro.observe(view);

  return {
    destroy: () => ro.disconnect(),
    select(id) { selected = id; drawPins(); },
  };
}
