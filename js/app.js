import * as db from './store.js';
import { mountElevation, pinIcon } from './elevation.js';
import { barChart } from './chart.js';
import { downscale, putPhoto, deletePhoto, photoURL } from './photos.js';

const main = document.getElementById('main');
const DAY = 86400000;
let cleanups = [];

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const litres = (n) => `${+n.toFixed(1)}`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const ICON = {
  complete: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>',
  partial: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2v16a8 8 0 0 1 0-16z"/></svg>',
  defect: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3 7.2 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"/></svg>',
  filter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v2l-7 7v6l-4-2v-4L3 7z"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/></svg>',
};

const statusChip = (s) => `<span class="chip s-${s}">${ICON[s]}${db.STATUSES[s]}</span>`;
const projectChip = (s) => `<span class="chip s-${s}">${db.PROJECT_STATUSES[s]}</span>`;

function ago(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}

function setAction(html) {
  document.querySelector('.actionbar')?.remove();
  main.classList.toggle('has-action', !!html);
  if (!html) return null;
  const bar = document.createElement('div');
  bar.className = 'actionbar';
  bar.innerHTML = `<div class="inner">${html}</div>`;
  main.after(bar);
  return bar;
}

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeJSON(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* per-viewer convenience only */ }
}

// ---------- slide-up sheet ----------
function openSheet({ title, body, primary = 'Apply', secondary = 'Reset', onPrimary, onSecondary, onOpen }) {
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
      <button type="button" class="btn iconbtn" data-close aria-label="Close">${ICON.close}</button></header>
    <div class="body">${body}</div>
    <footer>
      ${secondary ? `<button type="button" class="btn" data-secondary>${esc(secondary)}</button>` : ''}
      <button type="button" class="btn primary" data-primary>${esc(primary)}</button>
    </footer>`;
  const opener = document.activeElement;
  document.body.append(back, sheet);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => { back.classList.add('open'); sheet.classList.add('open'); });

  const close = () => {
    sheet.classList.remove('open');
    back.classList.remove('open');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    setTimeout(() => { back.remove(); sheet.remove(); }, 230);
    opener?.focus?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      const f = [...sheet.querySelectorAll('button, select, input, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled);
      if (e.shiftKey && document.activeElement === f[0]) { f.at(-1).focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { f[0].focus(); e.preventDefault(); }
    }
  };
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', close);
  sheet.querySelector('[data-close]').addEventListener('click', close);
  sheet.querySelector('[data-primary]').addEventListener('click', () => { onPrimary?.(sheet); close(); });
  sheet.querySelector('[data-secondary]')?.addEventListener('click', () => onSecondary?.(sheet));

  // Drag the handle/header down to dismiss.
  let y0 = null;
  const head = sheet.querySelector('header');
  [sheet.querySelector('.grab'), head].forEach((h) => h.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    y0 = e.clientY; try { h.setPointerCapture(e.pointerId); } catch { /* ignore */ } sheet.style.transition = 'none';
  }));
  sheet.addEventListener('pointermove', (e) => { if (y0 != null) sheet.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`; });
  sheet.addEventListener('pointerup', (e) => {
    if (y0 == null) return;
    const dy = e.clientY - y0; y0 = null;
    sheet.style.transition = ''; sheet.style.transform = '';
    if (dy > 80) close();
  });

  onOpen?.(sheet);
  setTimeout(() => sheet.querySelector('[data-close]').focus(), 50);
  return close;
}

// ---------- Jobs ----------
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; if (route().name === 'jobs') render(); });

function viewJobs() {
  const st = db.getState();
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const live = db.projects().filter((p) => p.status !== 'done');

  main.innerHTML = `
    <div class="pagehead"><h1>Today's jobs</h1></div>
    ${!standalone && (installEvt || ios) ? `
      <div class="card install">
        <h2>Add InjectaTrace to your home screen</h2>
        <p>${installEvt ? 'Opens full screen and works with no signal.' : 'Tap Share, then “Add to Home Screen”.'}</p>
        ${installEvt ? '<button class="btn block" id="install">Install app</button>' : ''}
      </div>` : ''}
    <div class="field">
      <label for="op">Operative</label>
      <select id="op">${db.OPERATIVES.map((o) => `<option ${o === st.settings.operative ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>
    </div>
    ${st.draft && st.draft.projectId ? `
      <div class="card"><div class="spread"><div><h3>Unsaved record</h3><p class="meta">${esc(db.project(st.draft.projectId)?.name)} · step ${st.draft.step + 1} of 5</p></div></div>
      <a class="btn dark block" href="#/record">Carry on</a></div>` : ''}
    <div class="jobs">
      ${live.map((p) => {
        const s = db.stats(p);
        return `
        <article class="card job">
          <div class="spread"><h2>${esc(p.name)}</h2>${projectChip(p.status)}</div>
          <p class="meta">${esc(p.site)} · ${esc(p.client)}</p>
          <div class="figs">
            <div><div class="big">${s.pct}%</div><div class="k">complete</div></div>
            <div><div class="big ${s.low ? 'lowstock' : ''}">${litres(s.ss17Remaining)}<small style="font-size:18px"> L</small></div><div class="k">SS17 left${s.low ? ' · LOW' : ''}</div></div>
          </div>
          <div class="progress" role="progressbar" aria-label="${esc(p.name)} complete" aria-valuenow="${s.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${s.pct}%"></i></div>
          <a class="btn primary block" style="margin-top:14px" href="#/record?project=${p.id}">Record work here</a>
        </article>`;
      }).join('')}
    </div>`;

  main.querySelector('#op').addEventListener('change', (e) => db.setSetting('operative', e.target.value));
  main.querySelector('#install')?.addEventListener('click', async () => {
    installEvt.prompt();
    await installEvt.userChoice;
    installEvt = null;
    render();
  });
  setAction(null);
}

// ---------- Record wizard ----------
const STEPS = ['Where', 'Pin location', 'Work done', 'Photos', 'Check & save'];

function newDraft(projectId = '') {
  return {
    step: 0, projectId, elevationId: '', pin: null,
    type: '', product: 'SS17', qty: 1, status: '', photos: [], notes: '',
  };
}

function viewRecord(params) {
  let d = db.getState().draft;
  if (params.get('project') && d?.projectId !== params.get('project')) {
    d = newDraft(params.get('project'));
    const p = db.project(d.projectId);
    if (p?.elevations.length === 1) d.elevationId = p.elevations[0].id;
    db.saveDraft(d);
    history.replaceState(null, '', '#/record');
  }
  if (!d) { d = newDraft(); db.saveDraft(d); }
  drawStep(d);
}

function canNext(d) {
  return [
    () => d.projectId && d.elevationId,
    () => !!d.pin,
    () => d.type && d.product && d.status && d.qty > 0,
    () => true,
    () => true,
  ][d.step]();
}

function drawStep(d) {
  const p = db.project(d.projectId);
  const el = db.elevation(p, d.elevationId);
  const save = () => db.saveDraft(d);
  const n = STEPS.length;

  const progress = `
    <div class="progressbar" aria-label="Progress">
      <p class="label">Step <b>${d.step + 1} of ${n}</b> · <b>${STEPS[d.step]}</b></p>
      <div class="steps" style="--n:${n}" aria-hidden="true">${STEPS.map((_, i) => `<i class="${i < d.step ? 'done' : i === d.step ? 'now' : ''}"></i>`).join('')}</div>
    </div>`;

  let body = '';
  if (d.step === 0) {
    body = `
      <h1>Where are you working?</h1>
      <div class="field">
        <label for="proj">Project</label>
        <select id="proj"><option value="">Choose project…</option>
          ${db.projects().filter((x) => x.status !== 'done').map((x) => `<option value="${x.id}" ${x.id === d.projectId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
        </select>
      </div>
      ${p ? `<fieldset class="field"><legend>Elevation</legend>
        <div class="choices">${p.elevations.map((e) => `<label class="choice"><input type="radio" name="elev" value="${e.id}" ${e.id === d.elevationId ? 'checked' : ''}><span>${esc(e.name)}</span></label>`).join('')}</div>
      </fieldset>` : ''}`;
  } else if (d.step === 1) {
    body = `
      <h1>Pin the location</h1>
      <p class="meta">${esc(p.name)} · ${esc(el.name)} elevation</p>
      <div id="elev"></div>
      <div class="pinstate" id="pinstate" aria-live="polite"></div>`;
  } else if (d.step === 2) {
    const stepQty = 0.5;
    body = `
      <h1>What did you do?</h1>
      <fieldset class="field"><legend>Work type</legend>
        <div class="choices" style="grid-template-columns:1fr 1fr">${db.WORK_TYPES.map((t) => `<label class="choice"><input type="radio" name="type" value="${esc(t)}" ${t === d.type ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div>
      </fieldset>
      <fieldset class="field"><legend>Product</legend>
        <div class="choices" style="grid-template-columns:1fr 1fr">${db.PRODUCTS.map((t) => `<label class="choice"><input type="radio" name="product" value="${t}" ${t === d.product ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>
      </fieldset>
      <div class="field">
        <span class="label" id="qtyl">Quantity used</span>
        <div class="stepper" role="group" aria-labelledby="qtyl">
          <button type="button" class="btn dark" data-q="-${stepQty}" aria-label="Less">−</button>
          <output id="qty" aria-live="polite">${litres(d.qty)}<small>L</small></output>
          <button type="button" class="btn dark" data-q="${stepQty}" aria-label="More">+</button>
        </div>
        <p class="hint">Steps of ${stepQty} L</p>
      </div>
      <fieldset class="field"><legend>Status</legend>
        <div class="choices cols-3">${Object.entries(db.STATUSES).map(([k, v]) => `<label class="choice"><input type="radio" name="status" value="${k}" ${k === d.status ? 'checked' : ''}><span>${ICON[k].replace('<svg', '<svg width="22" height="22" fill="currentColor"')}${v}</span></label>`).join('')}</div>
      </fieldset>`;
  } else if (d.step === 3) {
    body = `
      <h1>Add photos</h1>
      <div class="photo-grid">
        ${['Before', 'After'].map((k) => `
          <label class="capture">
            <input type="file" accept="image/*" capture="environment" data-kind="${k}" aria-label="Take ${k.toLowerCase()} photo">
            <span class="btn ${k === 'After' ? 'primary' : 'dark'}">${ICON.camera}${k} photo</span>
          </label>`).join('')}
      </div>
      <div class="shots" id="shots"></div>
      <div class="field" style="margin-top:20px">
        <label for="notes">Notes <span class="meta">(optional)</span></label>
        <textarea id="notes" rows="3">${esc(d.notes)}</textarea>
      </div>`;
  } else {
    body = `
      <h1>Check and save</h1>
      <div class="card review">
        <dl>
          <dt>Project</dt><dd>${esc(p.name)}</dd>
          <dt>Elevation</dt><dd>${esc(el.name)}</dd>
          <dt>Location</dt><dd>${esc(d.pin.floor)}, bay ${d.pin.bay}</dd>
          <dt>Work</dt><dd>${esc(d.type)}</dd>
          <dt>Product</dt><dd>${esc(d.product)} · ${litres(d.qty)} L</dd>
          <dt>Status</dt><dd>${statusChip(d.status)}</dd>
          <dt>Photos</dt><dd>${d.photos.length || 'None'}</dd>
          ${d.notes ? `<dt>Notes</dt><dd>${esc(d.notes)}</dd>` : ''}
          <dt>By</dt><dd>${esc(db.getState().settings.operative)}</dd>
        </dl>
      </div>
      <div class="row">${['Where', 'Pin', 'Work', 'Photos'].map((t, i) => `<button type="button" class="btn small" data-goto="${i}">Edit ${t.toLowerCase()}</button>`).join('')}</div>`;
  }

  main.innerHTML = `<div class="wizard">${progress}${body}</div>`;
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);

  const last = d.step === n - 1;
  const bar = setAction(`
    ${d.step > 0 ? '<button type="button" class="btn secondary" id="back">Back</button>' : ''}
    <button type="button" class="btn primary" id="next">${last ? 'Save record' : d.step === 3 && !d.photos.length ? 'Skip photos' : 'Next'}</button>`);
  const next = bar.querySelector('#next');
  const refresh = () => {
    const ok = canNext(d);
    next.disabled = !ok;
    if (d.step === 3) next.textContent = d.photos.length ? 'Next' : 'Skip photos';
  };
  refresh();

  bar.querySelector('#back')?.addEventListener('click', () => { d.step--; save(); drawStep(d); });
  next.addEventListener('click', () => {
    if (!canNext(d)) return;
    if (last) return saveRecord(d);
    d.step++; save(); drawStep(d);
  });

  // Step wiring
  if (d.step === 0) {
    main.querySelector('#proj').addEventListener('change', (e) => {
      d.projectId = e.target.value;
      const np = db.project(d.projectId);
      d.elevationId = np?.elevations.length === 1 ? np.elevations[0].id : '';
      d.pin = null; save(); drawStep(d);
    });
    main.querySelectorAll('[name=elev]').forEach((r) => r.addEventListener('change', () => {
      if (d.elevationId !== r.value) d.pin = null;
      d.elevationId = r.value; save(); refresh();
    }));
  }

  if (d.step === 1) {
    const state = main.querySelector('#pinstate');
    const showPin = () => {
      state.innerHTML = d.pin
        ? `${pinIcon}<span>Pinned: ${esc(d.pin.floor)}, bay ${d.pin.bay}. Tap the drawing to move it.</span>`
        : '<span class="meta">No pin yet. Zoom in, then tap where you worked.</span>';
    };
    showPin();
    const others = db.recordsFor(p.id).filter((r) => r.elevationId === el.id);
    const m = mountElevation(main.querySelector('#elev'), {
      el, pins: others, editable: true, value: d.pin,
      onConfirm: (pin) => { d.pin = pin; save(); showPin(); refresh(); },
    });
    cleanups.push(m.destroy);
  }

  if (d.step === 2) {
    main.querySelectorAll('input[type=radio]').forEach((r) => r.addEventListener('change', () => { d[r.name] = r.value; save(); refresh(); }));
    main.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
      d.qty = Math.min(50, Math.max(0.5, Math.round((d.qty + +b.dataset.q) * 2) / 2));
      main.querySelector('#qty').innerHTML = `${litres(d.qty)}<small>L</small>`;
      save(); refresh();
    }));
  }

  if (d.step === 3) {
    const shots = main.querySelector('#shots');
    const drawShots = async () => {
      const items = await Promise.all(d.photos.map(async (ph) => ({ ...ph, url: await photoURL(ph.id) })));
      shots.innerHTML = items.map((ph) => `
        <div class="shot">${ph.url ? `<img src="${ph.url}" alt="${ph.kind} photo">` : ''}<span class="tag">${ph.kind}</span>
          <button type="button" data-del="${ph.id}" aria-label="Remove ${ph.kind.toLowerCase()} photo">${ICON.close}</button></div>`).join('');
    };
    drawShots();
    main.querySelectorAll('input[type=file]').forEach((inp) => inp.addEventListener('change', async () => {
      const file = inp.files?.[0];
      if (!file) return;
      try {
        const blob = await downscale(file).catch(() => file);
        const id = uid();
        await putPhoto(id, blob);
        d.photos.push({ id, kind: inp.dataset.kind });
        save(); drawShots(); refresh();
        toast(`${inp.dataset.kind} photo added`);
      } catch {
        toast('Could not save photo. Storage may be full.');
      }
      inp.value = '';
    }));
    shots.addEventListener('click', async (e) => {
      const id = e.target.closest('[data-del]')?.dataset.del;
      if (!id) return;
      d.photos = d.photos.filter((x) => x.id !== id);
      await deletePhoto(id).catch(() => {});
      save(); drawShots(); refresh();
    });
    main.querySelector('#notes').addEventListener('input', (e) => { d.notes = e.target.value; save(); });
  }

  if (d.step === 4) {
    main.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => { d.step = +b.dataset.goto; save(); drawStep(d); }));
  }
}

function saveRecord(d) {
  const p = db.project(d.projectId);
  const el = db.elevation(p, d.elevationId);
  db.addRecord({
    id: uid(), projectId: p.id, elevationId: el.id,
    x: d.pin.x, y: d.pin.y, floor: d.pin.floor, bay: d.pin.bay,
    type: d.type, product: d.product, qty: d.qty, status: d.status,
    notes: d.notes.trim(), photos: d.photos, operative: db.getState().settings.operative,
    createdAt: Date.now(),
  });
  db.clearDraft();

  main.innerHTML = `
    <div class="wizard empty">
      <div style="width:72px;height:72px;margin:0 auto 12px;border-radius:50%;background:var(--good-bg);color:var(--good);display:flex;align-items:center;justify-content:center">${ICON.complete.replace('<svg', '<svg width="44" height="44" fill="currentColor"')}</div>
      <h1>Record saved</h1>
      <p>${esc(p.name)} · ${esc(el.name)} · ${esc(d.pin.floor)}, bay ${d.pin.bay}</p>
      <a class="btn block" href="#/log" style="margin-top:12px">View log</a>
    </div>`;
  const bar = setAction('<button type="button" class="btn primary" id="again">Record next on this elevation</button>');
  bar.querySelector('#again').addEventListener('click', () => {
    const nd = newDraft(p.id);
    nd.elevationId = el.id;
    nd.step = 1;
    nd.type = d.type; nd.product = d.product; nd.qty = d.qty;
    db.saveDraft(nd);
    drawStep(nd);
  });
  toast('Saved on this device');
}

// ---------- Log ----------
function viewLog() {
  const mineOnly = readJSON('injectatrace.logMine', true);
  const me = db.getState().settings.operative;
  const list = db.records()
    .filter((r) => !mineOnly || r.operative === me)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 60);

  main.innerHTML = `
    <div class="pagehead"><h1>Log</h1></div>
    <fieldset class="field"><legend class="sr">Show</legend>
      <div class="choices" style="grid-template-columns:1fr 1fr">
        <label class="choice"><input type="radio" name="who" value="me" ${mineOnly ? 'checked' : ''}><span>My records</span></label>
        <label class="choice"><input type="radio" name="who" value="all" ${!mineOnly ? 'checked' : ''}><span>Everyone</span></label>
      </div>
    </fieldset>
    ${list.length ? '' : '<p class="empty">Nothing recorded yet.</p>'}
    <div class="stack">${list.map((r) => {
      const p = db.project(r.projectId);
      const el = db.elevation(p, r.elevationId);
      return `
        <article class="card entry">
          <div class="thumb" data-photo="${r.photos[0]?.id ?? ''}">${r.photos.length ? '' : 'No photo'}</div>
          <div>
            <div class="spread" style="align-items:flex-start"><h3>${esc(r.type)}</h3>${statusChip(r.status)}</div>
            <p class="meta" style="margin:0">${esc(p?.name)} · ${esc(el?.name)} · ${esc(r.floor)}, bay ${r.bay}</p>
            <p class="meta" style="margin:0">${esc(r.product)} ${litres(r.qty)} L · ${esc(r.operative)} · ${ago(r.createdAt)}</p>
          </div>
        </article>`;
    }).join('')}</div>`;

  main.querySelectorAll('[name=who]').forEach((r) => r.addEventListener('change', () => { writeJSON('injectatrace.logMine', r.value === 'me'); viewLog(); }));
  main.querySelectorAll('.thumb[data-photo]:not([data-photo=""])').forEach(async (t) => {
    const u = await photoURL(t.dataset.photo);
    if (u) t.style.backgroundImage = `url("${u}")`;
  });
  setAction(null);
}

// ---------- Back office ----------
const DEFAULT_FILTERS = { status: ['active', 'hold'], client: 'all', range: '30', low: false };
const RANGES = { 7: 'Last 7 days', 30: 'Last 30 days', 90: 'Last 90 days', all: 'All time' };

function filtered(f) {
  return db.projects().filter((p) =>
    f.status.includes(p.status) &&
    (f.client === 'all' || p.client === f.client) &&
    (!f.low || db.stats(p).low));
}

function weekly(projectIds) {
  const weeks = [];
  const start = new Date(); start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday
  for (let i = 7; i >= 0; i--) {
    const from = start.getTime() - i * 7 * DAY;
    const used = db.records()
      .filter((r) => projectIds.has(r.projectId) && r.product === 'SS17' && r.createdAt >= from && r.createdAt < from + 7 * DAY)
      .reduce((t, r) => t + r.qty, 0);
    const dt = new Date(from);
    weeks.push({
      label: `${dt.getDate()}/${dt.getMonth() + 1}`,
      detail: `w/c ${dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
      value: +used.toFixed(1),
    });
  }
  return weeks;
}

function viewOffice() {
  const f = { ...DEFAULT_FILTERS, ...readJSON('injectatrace.filters', {}) };
  const since = f.range === 'all' ? 0 : Date.now() - +f.range * DAY;
  const list = filtered(f);
  const rows = list.map((p) => ({ p, s: db.stats(p, since) }));
  const target = list.reduce((t, p) => t + p.targetPoints, 0);
  const done = rows.reduce((t, r) => t + r.s.complete, 0);
  const remaining = rows.reduce((t, r) => t + r.s.ss17Remaining, 0);
  const inRange = rows.reduce((t, r) => t + r.s.count, 0);
  const defects = rows.reduce((t, r) => t + r.s.defects, 0);
  const nActive = (f.status.length !== DEFAULT_FILTERS.status.length || !DEFAULT_FILTERS.status.every((s) => f.status.includes(s)) ? 1 : 0)
    + (f.client !== 'all' ? 1 : 0) + (f.range !== DEFAULT_FILTERS.range ? 1 : 0) + (f.low ? 1 : 0);

  main.innerHTML = `
    <div class="pagehead">
      <h1>Back office</h1>
      <button type="button" class="btn dark" id="filters" aria-haspopup="dialog">${ICON.filter}Filters${nActive ? ` (${nActive})` : ''}</button>
    </div>
    <div class="activefilters" style="margin-bottom:14px">
      <span class="chip">${f.status.map((s) => db.PROJECT_STATUSES[s]).join(', ') || 'No status'}</span>
      <span class="chip">${esc(RANGES[f.range])}</span>
      ${f.client !== 'all' ? `<span class="chip">${esc(f.client)}</span>` : ''}
      ${f.low ? '<span class="chip">Low SS17</span>' : ''}
    </div>
    <section class="kpis" aria-label="Summary">
      <div class="kpi"><div class="v">${target ? Math.round((done / target) * 100) : 0}%</div><div class="k">Overall complete</div></div>
      <div class="kpi"><div class="v">${litres(remaining)}<small> L</small></div><div class="k">SS17 remaining</div></div>
      <div class="kpi"><div class="v">${inRange}</div><div class="k">Records · ${esc(RANGES[f.range].toLowerCase())}</div></div>
      <div class="kpi ${defects ? 'alert' : ''}"><div class="v">${defects}</div><div class="k">Defects logged</div></div>
    </section>
    <div class="office-grid">
      <section class="card">
        <h2>SS17 used per week</h2>
        <p class="meta">Litres, last 8 weeks, filtered projects. Tap a bar for detail.</p>
        <div id="chart"></div>
      </section>
      <section>
        <h2 class="sr">Projects</h2>
        ${rows.length ? `
        <table class="rtable">
          <thead><tr><th>Project</th><th>Complete</th><th>SS17 left</th><th>Records</th><th>Defects</th><th><span class="sr">Open</span></th></tr></thead>
          <tbody>${rows.map(({ p, s }) => `
            <tr>
              <td class="name"><a class="title" href="#/office/${p.id}">${esc(p.name)}</a><div class="meta">${esc(p.client)} · ${projectChip(p.status)}</div></td>
              <td class="key" data-label="Complete"><div class="num">${s.pct}<small>%</small></div><div class="progress"><i style="width:${s.pct}%"></i></div></td>
              <td class="key" data-label="SS17 left"><div class="num ${s.low ? 'lowstock' : ''}">${litres(s.ss17Remaining)}<small> L</small></div><div class="meta">of ${p.ss17Allocated} L${s.low ? ' · <b class="lowstock">LOW</b>' : ''}</div></td>
              <td data-label="Records">${s.count}</td>
              <td data-label="Defects">${s.defects}</td>
              <td class="go"><a class="btn block small" href="#/office/${p.id}">Open project</a></td>
            </tr>`).join('')}
          </tbody>
        </table>` : '<p class="empty card">No projects match these filters.</p>'}
      </section>
    </div>`;

  cleanups.push(barChart(main.querySelector('#chart'), {
    data: weekly(new Set(list.map((p) => p.id))), unit: 'L', label: 'SS17 litres used per week',
  }).destroy);

  main.querySelector('#filters').addEventListener('click', () => {
    const clients = [...new Set(db.projects().map((p) => p.client))];
    openSheet({
      title: 'Filter projects',
      body: `
        <fieldset class="field"><legend>Project status</legend>
          <div class="choices cols-3">${Object.entries(db.PROJECT_STATUSES).map(([k, v]) => `<label class="choice"><input type="checkbox" name="st" value="${k}" ${f.status.includes(k) ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div>
        </fieldset>
        <div class="field"><label for="fc">Client</label>
          <select id="fc"><option value="all">All clients</option>${clients.map((c) => `<option ${c === f.client ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <fieldset class="field"><legend>Records from</legend>
          <div class="choices" style="grid-template-columns:1fr 1fr">${Object.entries(RANGES).map(([k, v]) => `<label class="choice"><input type="radio" name="rg" value="${k}" ${k === f.range ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div>
        </fieldset>
        <label class="toggle"><span>Only projects low on SS17</span><input type="checkbox" id="fl" ${f.low ? 'checked' : ''}></label>`,
      primary: 'Show results',
      onPrimary: (sh) => {
        writeJSON('injectatrace.filters', {
          status: [...sh.querySelectorAll('[name=st]:checked')].map((x) => x.value),
          client: sh.querySelector('#fc').value,
          range: sh.querySelector('[name=rg]:checked')?.value ?? '30',
          low: sh.querySelector('#fl').checked,
        });
        viewOffice();
      },
      onSecondary: (sh) => {
        sh.querySelectorAll('[name=st]').forEach((x) => { x.checked = DEFAULT_FILTERS.status.includes(x.value); });
        sh.querySelector('#fc').value = 'all';
        sh.querySelector(`[name=rg][value="${DEFAULT_FILTERS.range}"]`).checked = true;
        sh.querySelector('#fl').checked = false;
      },
    });
  });
  setAction(null);
}

function viewProject(id) {
  const p = db.project(id);
  if (!p) { main.innerHTML = '<p class="empty">Project not found.</p>'; setAction(null); return; }
  const s = db.stats(p);
  const key = `injectatrace.elev.${p.id}`;
  let elId = readJSON(key, p.elevations[0].id);
  if (!db.elevation(p, elId)) elId = p.elevations[0].id;
  const el = db.elevation(p, elId);
  const recs = db.recordsFor(p.id).filter((r) => r.elevationId === el.id).sort((a, b) => b.createdAt - a.createdAt);

  main.innerHTML = `
    <a class="btn small" href="#/office" style="margin-bottom:12px">${ICON.back}Back office</a>
    <div class="pagehead"><div><h1>${esc(p.name)}</h1><p class="meta" style="margin:4px 0 0">${esc(p.client)} · ${esc(p.site)}</p></div>${projectChip(p.status)}</div>
    <section class="kpis" aria-label="Project summary">
      <div class="kpi"><div class="v">${s.pct}%</div><div class="k">Complete (${s.complete}/${p.targetPoints})</div></div>
      <div class="kpi ${s.low ? 'alert' : ''}"><div class="v ${s.low ? 'lowstock' : ''}">${litres(s.ss17Remaining)}<small> L</small></div><div class="k">SS17 left of ${p.ss17Allocated} L</div></div>
      <div class="kpi"><div class="v">${s.count}</div><div class="k">Records</div></div>
      <div class="kpi ${s.defects ? 'alert' : ''}"><div class="v">${s.defects}</div><div class="k">Defects</div></div>
    </section>
    <fieldset class="field"><legend>Elevation</legend>
      <div class="choices">${p.elevations.map((e) => `<label class="choice"><input type="radio" name="pe" value="${e.id}" ${e.id === el.id ? 'checked' : ''}><span>${esc(e.name)}</span></label>`).join('')}</div>
    </fieldset>
    <div class="office-grid">
      <div>
        <div id="elev"></div>
        <div class="row meta" style="margin:10px 0 16px">${['complete', 'partial', 'defect'].map((k) => statusChip(k)).join('')}</div>
      </div>
      <div>
        <div id="picked" aria-live="polite"></div>
        <h2>${esc(el.name)} records (${recs.length})</h2>
        <div class="stack" id="recs">${recs.slice(0, 30).map((r) => recCard(r)).join('')}</div>
      </div>
    </div>`;

  main.querySelectorAll('[name=pe]').forEach((r) => r.addEventListener('change', () => { writeJSON(key, r.value); viewProject(id); }));
  const m = mountElevation(main.querySelector('#elev'), {
    el, pins: recs,
    onSelect: (rid) => {
      const r = recs.find((x) => x.id === rid);
      main.querySelector('#picked').innerHTML = r ? `<div class="card" style="border:2px solid var(--orange)"><p class="meta" style="margin:0 0 6px">Selected on drawing</p>${recInner(r)}</div>` : '';
    },
  });
  cleanups.push(m.destroy);
  setAction(null);
}

const recInner = (r) => `
  <div class="spread" style="align-items:flex-start"><h3>${esc(r.type)}</h3>${statusChip(r.status)}</div>
  <p class="meta" style="margin:0">${esc(r.floor)}, bay ${r.bay} · ${esc(r.product)} ${litres(r.qty)} L</p>
  <p class="meta" style="margin:0">${esc(r.operative)} · ${ago(r.createdAt)}${r.photos.length ? ` · ${r.photos.length} photo${r.photos.length > 1 ? 's' : ''}` : ''}</p>
  ${r.notes ? `<p style="margin:6px 0 0">${esc(r.notes)}</p>` : ''}`;
const recCard = (r) => `<article class="card" style="margin:0">${recInner(r)}</article>`;

// ---------- router ----------
function route() {
  const [path, qs] = (location.hash.slice(1) || '/jobs').split('?');
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0] || 'jobs', id: parts[1], params: new URLSearchParams(qs) };
}

function render() {
  cleanups.forEach((fn) => fn());
  cleanups = [];
  document.getElementById('toast').classList.remove('show');
  const r = route();
  document.querySelectorAll('.bottomnav a').forEach((a) => {
    if (a.dataset.tab === r.name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const titles = { jobs: 'Jobs', record: 'Record work', log: 'Log', office: 'Back office' };
  document.title = `${titles[r.name] ?? 'InjectaTrace'} · InjectaTrace`;
  if (r.name === 'record') viewRecord(r.params);
  else if (r.name === 'log') viewLog();
  else if (r.name === 'office' && r.id) viewProject(r.id);
  else if (r.name === 'office') viewOffice();
  else viewJobs();
}

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

function netStatus() {
  const n = document.getElementById('net');
  n.textContent = navigator.onLine ? '' : 'Offline · saving on device';
  n.classList.toggle('off', !navigator.onLine);
}
window.addEventListener('online', netStatus);
window.addEventListener('offline', netStatus);
netStatus();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

render();
