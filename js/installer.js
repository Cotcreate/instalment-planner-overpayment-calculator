// Installer (operative) screens: Projects, Capture (hold point), Daily checks, Records.
import * as db from './store.js';
import { mountElevation, pinIcon } from './elevation.js';
import { downscale, putFile, deleteFile, fileURL } from './files.js';
import {
  esc, uid, num, I, time, ago, trail, toast, setAction, openSheet, qaChip, stepper, wireSteppers,
  locate, gpsText, signaturePad, wordmark,
} from './ui.js';

const STEPS = ['Location', 'Pin', 'Measurements', 'Photos', 'Check'];

// ---------- shared bits ----------
export async function storeCapture(file) {
  const isVideo = file.type.startsWith('video/');
  const blob = isVideo ? file : await downscale(file).catch(() => file);
  const id = uid();
  await putFile(id, blob);
  return { id, kind: isVideo ? 'video' : 'image' };
}

export async function shotTiles(list, { removable = false } = {}) {
  const tiles = await Promise.all(list.map(async (s, i) => {
    if (s.sample || !s.id) return `<div class="shot sample" title="Sample photo">${I.camera}</div>`;
    const u = await fileURL(s.id);
    const media = !u ? '' : s.kind === 'video' ? `<video src="${u}" muted playsinline preload="metadata"></video><span class="vid">VIDEO</span>` : `<img src="${u}" alt="">`;
    return `<div class="shot">${media}${removable ? `<button type="button" data-del="${i}" aria-label="Remove">${I.x}</button>` : ''}</div>`;
  }));
  return tiles.join('');
}

export function ramsSheet(st, operativeId, onDone) {
  const doc = st.docs.rams.at(-1);
  openSheet({
    title: `Sign RAMS rev ${st.rams.rev}`,
    body: `
      <p class="eyebrow">${esc(st.name)} · Week ${db.isoWeek().split('-W')[1]}</p>
      <div class="card flat" style="display:flex;gap:12px;align-items:center">
        <span style="width:40px;height:40px;border-radius:10px;background:var(--tint);display:flex;align-items:center;justify-content:center;flex:none">${I.file.replace('<svg', '<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"')}</span>
        <div style="min-width:0"><strong style="display:block;overflow-wrap:anywhere">${esc(doc?.name || 'RAMS')}</strong><span class="muted small">Issued ${doc ? new Date(doc.at).toLocaleDateString('en-GB') : ''}</span></div>
      </div>
      <label class="toggle"><span>I have read and understood this RAMS</span><input type="checkbox" id="ack"></label>
      <p class="label" style="margin-top:12px">Sign below</p>
      <canvas class="sigpad" id="sig" aria-label="Signature pad"></canvas>
      <button type="button" class="btn ghost sm" id="clr" style="margin-top:6px">Clear signature</button>`,
    primary: 'Sign RAMS',
    onOpen: (sh) => {
      const pad = signaturePad(sh.querySelector('#sig'));
      const btn = sh.querySelector('[data-primary]');
      const check = () => { btn.disabled = !(sh.querySelector('#ack').checked && !pad.empty()); };
      sh.querySelector('#ack').addEventListener('change', check);
      sh.querySelector('#sig').addEventListener('change', check);
      sh.querySelector('#clr').addEventListener('click', () => pad.clear());
      check();
      sh._pad = pad;
    },
    onPrimary: (sh) => {
      db.signRams(st, operativeId, sh._pad.dataURL());
      toast(`RAMS rev ${st.rams.rev} signed`);
      onDone?.();
    },
  });
}

function row(k, v) { return `<li><span class="k">${k}</span><span class="v">${v}</span></li>`; }
const needed = '<span style="display:inline-flex;align-items:center;gap:6px"><span class="dot" style="color:var(--orange)"></span>Needed</span>';
const done = (t) => `<span style="display:inline-flex;align-items:center;gap:6px;color:var(--green)">${I.check.replace('<svg', '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4"')}${t}</span>`;

// ---------- Projects ----------
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });

export function viewProjects(ctx) {
  const { main, sess } = ctx;
  const me = db.operative(sess.operativeId);
  const sites = db.sitesFor(sess);
  const draft = db.S().draft;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const hr = new Date().getHours();

  main.innerHTML = `
    <p class="eyebrow">${hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'}, ${esc(me.name.split(' ')[0])}</p>
    <div class="pagehead"><h1>Your sites</h1></div>
    ${!standalone && installEvt ? `
      <div class="card install"><img src="icons/icon-192.png" alt="">
        <div style="flex:1"><strong>Add to home screen</strong><div class="muted small">Full screen, works with no signal.</div></div>
        <button class="btn sm primary" id="install">Install</button></div>` : ''}
    ${draft?.siteId ? `
      <a class="card cardlink warn" href="#/capture">
        <p class="eyebrow">Unsaved hold point</p>
        <div class="spread"><strong>${esc(db.site(draft.siteId)?.name)} · step ${draft.step + 1} of 5</strong>${I.chev.replace('<svg', '<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"')}</div>
      </a>` : ''}
    <div class="stack grid2">${sites.map((st) => {
      const s = db.siteStats(st);
      const signed = db.ramsSigned(st, sess.operativeId);
      const d = db.dayFor(st.id);
      return `
        <article class="card">
          <p class="eyebrow">Project · FR ${st.fireRating} min</p>
          <h2 style="margin-bottom:2px">${esc(st.name)}</h2>
          <p class="muted small">${esc(st.address)}</p>
          <ul class="list" style="margin:8px 0 14px">
            ${row(`RAMS rev ${st.rams.rev}`, signed ? done('Signed') : needed)}
            ${row('AM checks', d?.am ? done(time(d.am.at)) : needed)}
            ${row('PM checks', d?.pm ? done(time(d.pm.at)) : hr < 12 ? '<span class="muted">After 12:00</span>' : needed)}
            ${row('Hold points', `<span class="mono">${s.pins} / ${st.targetPins}</span>`)}
          </ul>
          ${signed
            ? `<div class="row" style="flex-wrap:nowrap"><a class="btn primary" style="flex:1.4" href="#/capture?site=${st.id}">${I.capture}Add hold point</a><a class="btn" style="flex:1" href="#/daily?site=${st.id}">Daily checks</a></div>`
            : `<button class="btn accent block" data-rams="${st.id}">${I.pen}Sign RAMS rev ${st.rams.rev}</button>`}
        </article>`;
    }).join('') || '<p class="empty card">No live sites assigned to you.</p>'}</div>`;

  main.querySelector('#install')?.addEventListener('click', async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; ctx.render(); });
  main.querySelectorAll('[data-rams]').forEach((b) => b.addEventListener('click', () => ramsSheet(db.site(b.dataset.rams), sess.operativeId, ctx.render)));
  setAction(main, null);
}

// ---------- Capture (hold point wizard) ----------
function newDraft(siteId = '') {
  const last = db.S().lastBatch[siteId];
  return {
    step: 0, siteId, elevationId: '', pin: null, level: '', gps: null,
    cavityDepth: null, socks: [null, null], abutted: false, length: null, pinQty: null,
    batch: last || '', pails: 1, photos: Object.fromEntries(db.PHOTO_HEADINGS.map((h) => [h.key, []])),
  };
}

function canNext(d) {
  return [
    () => d.siteId && d.elevationId,
    () => !!d.pin && (!!d.pin.level || !!d.level),
    () => d.cavityDepth > 0 && d.socks[0] && (!d.abutted || d.socks[1]) && d.length > 0 && d.pinQty > 0 && d.batch.trim() && d.pails > 0,
    () => true,
    () => true,
  ][d.step]();
}

async function elevationImage(el) {
  if (!el?.image) return null;
  const url = await fileURL(el.image.id);
  return url ? { url, w: el.image.w, h: el.image.h } : null;
}

export function viewCapture(ctx, params) {
  let d = db.S().draft;
  const pre = params.get('site');
  if (pre && d?.siteId !== pre) {
    d = newDraft(pre);
    const st = db.site(pre);
    if (st?.elevations.length === 1) d.elevationId = st.elevations[0].id;
    db.saveDraft(d);
    history.replaceState(null, '', '#/capture');
  }
  if (!d) { d = newDraft(); db.saveDraft(d); }
  drawStep(ctx, d);
}

async function drawStep(ctx, d) {
  const { main, sess } = ctx;
  const st = db.site(d.siteId);
  const el = db.elevation(st, d.elevationId);
  const save = () => db.saveDraft(d);
  const last = d.step === STEPS.length - 1;
  const blocked = st && !db.ramsSigned(st, sess.operativeId);
  let body = '';

  if (d.step === 0) {
    const sites = db.sitesFor(sess);
    body = `
      <h1>New hold point</h1>
      <div class="field">
        <label for="site">Site</label>
        <select id="site"><option value="">Choose site…</option>
          ${sites.map((x) => `<option value="${x.id}" ${x.id === d.siteId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
        </select>
      </div>
      ${blocked ? `
        <div class="card warn">
          <p class="eyebrow" style="color:var(--orange-deep)">Action needed</p>
          <p><strong>Sign this week's RAMS (rev ${st.rams.rev}) before recording work on this site.</strong></p>
          <button class="btn accent block" id="sign">${I.pen}Sign RAMS rev ${st.rams.rev}</button>
        </div>` : st ? `
        <fieldset class="field"><legend>Elevation</legend>
          <div class="choices">${st.elevations.map((e) => `<label class="choice"><input type="radio" name="elev" value="${e.id}" ${e.id === d.elevationId ? 'checked' : ''}><span>${esc(e.name)}</span></label>`).join('')}</div>
        </fieldset>
        <p class="eyebrow">Hold point no.</p><p class="mono" style="font-size:22px">HP ${String(db.nextPinNo(st.id)).padStart(2, '0')}</p>` : ''}`;
  } else if (d.step === 1) {
    body = `
      <p class="eyebrow">${esc(st.name)} · ${esc(el.name)} elevation</p>
      <h1>Pin the location</h1>
      <div id="elev"></div>
      <div class="pinstate" id="pinstate" aria-live="polite"></div>
      <div id="levelpick"></div>`;
  } else if (d.step === 2) {
    body = `
      <p class="eyebrow">${esc(st.name)} · ${esc(el.name)} · ${esc(d.pin.level || d.level)}</p>
      <h1>Measurements</h1>
      <div class="field"><label for="cavityDepth">Cavity depth <span class="req">*</span></label>${stepper('cavityDepth', d.cavityDepth, { step: 5, min: 0, max: 500, label: 'Cavity depth', unit: 'mm' })}</div>
      <fieldset class="field"><legend>Sock installed <span class="req">*</span></legend>
        <div class="choices c5">${db.SOCK_SIZES.map((mm) => `<label class="choice"><input type="radio" name="sock0" value="${mm}" ${d.socks[0] === mm ? 'checked' : ''}><span>${mm}</span></label>`).join('')}</div>
        <p class="hint">Diameter in mm</p>
        <label class="toggle"><span>Abutted (second sock)</span><input type="checkbox" id="abutted" ${d.abutted ? 'checked' : ''}></label>
        <div id="sock2" ${d.abutted ? '' : 'hidden'}>
          <div class="choices c5">${db.SOCK_SIZES.map((mm) => `<label class="choice"><input type="radio" name="sock1" value="${mm}" ${d.socks[1] === mm ? 'checked' : ''}><span>${mm}</span></label>`).join('')}</div>
        </div>
      </fieldset>
      <div class="field"><label for="length">Injected length <span class="req">*</span></label>${stepper('length', d.length, { step: 0.1, min: 0, max: 100, label: 'Injected length', unit: 'm' })}</div>
      <div class="field"><label for="pinQty">Pins installed <span class="req">*</span></label>${stepper('pinQty', d.pinQty, { step: 1, min: 0, max: 200, label: 'Pins installed', unit: 'pins' })}</div>
      <div class="field"><label for="batch">Pail batch no. <span class="req">*</span></label>
        <input id="batch" class="mono-in" type="text" autocomplete="off" autocapitalize="characters" value="${esc(d.batch)}" placeholder="e.g. IFB-2412">
        ${db.S().lastBatch[d.siteId] ? `<p class="hint">Last used on this site: <span class="mono">${esc(db.S().lastBatch[d.siteId])}</span></p>` : ''}</div>
      <div class="field"><label for="pails">Pails used <span class="req">*</span></label>${stepper('pails', d.pails, { step: 1, min: 0, max: 50, label: 'Pails used', unit: 'pails' })}
        <p class="hint">Not visible to the client.</p></div>`;
  } else if (d.step === 3) {
    const gaps = db.photoGaps(d).length;
    body = `
      <p class="eyebrow">HP ${String(db.nextPinNo(st.id)).padStart(2, '0')} · ${esc(el.name)} · ${esc(d.pin.level || d.level)}</p>
      <h1>Photos</h1>
      <p class="muted" id="gapline">${gaps ? `${db.PHOTO_HEADINGS.length - gaps} of ${db.PHOTO_HEADINGS.length} done. Add as many as you need under each.` : 'All headings covered.'}</p>
      <div class="card">${db.PHOTO_HEADINGS.map((h) => `
        <section class="shotrow" data-h="${h.key}">
          <div class="head">
            <div><h3>${esc(h.label)}</h3>${h.hint ? `<div class="muted small">${esc(h.hint)}</div>` : ''}</div>
            <span class="count"></span>
          </div>
          <div class="shots" style="margin-bottom:10px"></div>
          <div class="row" style="flex-wrap:nowrap">
            <label class="capture" style="flex:1"><input type="file" accept="image/*" capture="environment" data-k="${h.key}" aria-label="Add ${esc(h.label)} photo"><span class="btn primary">${I.camera}${h.video ? 'Photo' : 'Add photo'}</span></label>
            ${h.video ? `<label class="capture" style="flex:1"><input type="file" accept="video/*" capture="environment" data-k="${h.key}" aria-label="Add ${esc(h.label)} video"><span class="btn">${I.video}Video</span></label>` : ''}
          </div>
        </section>`).join('')}</div>`;
  } else {
    const gaps = db.photoGaps(d);
    const no = db.nextPinNo(st.id);
    body = `
      <p class="eyebrow">Check before saving</p>
      <h1>HP ${String(no).padStart(2, '0')}</h1>
      ${gaps.length ? `<div class="card warn"><p class="eyebrow" style="color:var(--orange-deep)">${gaps.length} photo heading${gaps.length > 1 ? 's' : ''} missing</p><p style="margin:0">${gaps.map((g) => esc(g.label)).join(', ')}. QA will send this back for rework.</p></div>` : ''}
      <div class="card"><ul class="list">
        ${row('Site', esc(st.name))}
        ${row('Location', `${esc(el.name)} · ${esc(d.pin.level || d.level)}${d.pin.bay ? ` · bay ${d.pin.bay}` : ''}`)}
        ${row('Cavity depth', `${d.cavityDepth} mm`)}
        ${row('Sock', `<span class="mono">${d.socks.filter(Boolean).slice(0, d.abutted ? 2 : 1).map((s) => `${s}mm`).join(' + ')}</span>`)}
        ${row('Injected length', `${num(d.length)} m`)}
        ${row('Pins installed', d.pinQty)}
        ${row('Pail batch', `<span class="mono">${esc(d.batch.toUpperCase())}</span>`)}
        ${row('Pails used', d.pails)}
        ${row('Photos', `${Object.values(d.photos).flat().length} across ${db.PHOTO_HEADINGS.length - gaps.length} headings`)}
        ${row('GPS', `<span class="mono small">${gpsText(d.gps)}</span>`)}
      </ul></div>
      <div class="row">${['Location', 'Pin', 'Measurements', 'Photos'].map((t, i) => `<button type="button" class="btn sm" data-goto="${i}">Edit ${t.toLowerCase()}</button>`).join('')}</div>`;
  }

  main.innerHTML = `<div class="narrow">${trail(STEPS, d.step)}${body}</div>`;
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);

  const bar = setAction(main, `
    ${d.step > 0 ? '<button type="button" class="btn secondary" id="back">Back</button>' : ''}
    <button type="button" class="btn primary" id="next">${last ? 'Save hold point' : 'Next'}</button>`);
  const next = bar.querySelector('#next');
  const refresh = () => { next.disabled = blocked || !canNext(d); };
  refresh();
  bar.querySelector('#back')?.addEventListener('click', () => { d.step--; save(); drawStep(ctx, d); });
  next.addEventListener('click', () => {
    if (!canNext(d)) return;
    if (last) return savePin(ctx, d);
    d.step++; save(); drawStep(ctx, d);
  });

  if (d.step === 0) {
    main.querySelector('#site').addEventListener('change', (e) => {
      Object.assign(d, newDraft(e.target.value));
      const ns = db.site(d.siteId);
      if (ns?.elevations.length === 1) d.elevationId = ns.elevations[0].id;
      save(); drawStep(ctx, d);
    });
    main.querySelector('#sign')?.addEventListener('click', () => ramsSheet(st, sess.operativeId, () => drawStep(ctx, d)));
    main.querySelectorAll('[name=elev]').forEach((r) => r.addEventListener('change', () => {
      if (d.elevationId !== r.value) d.pin = null;
      d.elevationId = r.value; save(); refresh();
    }));
  }

  if (d.step === 1) {
    const state = main.querySelector('#pinstate');
    const image = await elevationImage(el);
    const showPin = () => {
      state.innerHTML = d.pin
        ? `${pinIcon}<span>Pinned${d.pin.level ? `: ${esc(d.pin.level)} · bay ${d.pin.bay}` : ''}. Tap the drawing to move it.</span>`
        : '<span class="muted">Zoom in, then tap where you are working.</span>';
      const lp = main.querySelector('#levelpick');
      if (d.pin && !d.pin.level) {
        const levels = ['Ground', ...Array.from({ length: el.floors - 1 }, (_, i) => `Level ${i + 1}`)];
        lp.innerHTML = `<div class="field" style="margin-top:14px"><label for="lvl">Level</label><select id="lvl"><option value="">Choose level…</option>${levels.map((l) => `<option ${l === d.level ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
        lp.querySelector('#lvl').addEventListener('change', (e) => { d.level = e.target.value; save(); refresh(); });
      } else lp.innerHTML = '';
    };
    showPin();
    const others = db.pinsFor(st.id).filter((p) => p.elevationId === el.id);
    const m = mountElevation(main.querySelector('#elev'), {
      el, pins: others, editable: true, value: d.pin, image,
      onConfirm: async (pin) => {
        d.pin = pin; save(); showPin(); refresh();
        d.gps = await locate(); save();
      },
    });
    ctx.cleanups.push(m.destroy);
  }

  if (d.step === 2) {
    wireSteppers(main, (id, v) => { d[id] = v; save(); refresh(); });
    main.querySelectorAll('[name=sock0],[name=sock1]').forEach((r) => r.addEventListener('change', () => {
      d.socks[r.name === 'sock0' ? 0 : 1] = +r.value; save(); refresh();
    }));
    main.querySelector('#abutted').addEventListener('change', (e) => {
      d.abutted = e.target.checked;
      main.querySelector('#sock2').hidden = !d.abutted;
      save(); refresh();
    });
    main.querySelector('#batch').addEventListener('input', (e) => { d.batch = e.target.value; save(); refresh(); });
  }

  if (d.step === 3) {
    const paint = async (key) => {
      const sec = main.querySelector(`[data-h="${key}"]`);
      const list = d.photos[key];
      sec.querySelector('.shots').innerHTML = await shotTiles(list, { removable: true });
      sec.querySelector('.count').innerHTML = list.length ? `<span class="chip c-green">${I.check}${list.length}</span>` : '<span class="chip c-orange"><span class="dot" style="color:var(--orange)"></span>Needed</span>';
      const gaps = db.photoGaps(d).length;
      main.querySelector('#gapline').textContent = gaps ? `${db.PHOTO_HEADINGS.length - gaps} of ${db.PHOTO_HEADINGS.length} done. Add as many as you need under each.` : 'All headings covered.';
    };
    db.PHOTO_HEADINGS.forEach((h) => paint(h.key));
    main.querySelectorAll('input[type=file]').forEach((inp) => inp.addEventListener('change', async () => {
      const files = [...(inp.files || [])];
      for (const f of files) {
        try { d.photos[inp.dataset.k].push(await storeCapture(f)); } catch { toast('Could not save. Storage may be full.'); }
      }
      inp.value = '';
      save(); paint(inp.dataset.k);
      if (files.length) toast('Added');
    }));
    main.querySelectorAll('.shotrow').forEach((sec) => sec.addEventListener('click', async (e) => {
      const i = e.target.closest('[data-del]')?.dataset.del;
      if (i == null) return;
      const [gone] = d.photos[sec.dataset.h].splice(+i, 1);
      deleteFile(gone.id).catch(() => {});
      save(); paint(sec.dataset.h);
    }));
  }

  if (d.step === 4) {
    main.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => { d.step = +b.dataset.goto; save(); drawStep(ctx, d); }));
  }
}

function savePin(ctx, d) {
  const { main, sess } = ctx;
  const st = db.site(d.siteId);
  const el = db.elevation(st, d.elevationId);
  const no = db.nextPinNo(st.id);
  const batch = d.batch.trim().toUpperCase();
  db.addPin({
    id: uid(), siteId: st.id, elevationId: el.id, no,
    x: d.pin.x, y: d.pin.y, level: d.pin.level || d.level, bay: d.pin.bay,
    cavityDepth: d.cavityDepth, socks: d.socks.filter(Boolean).slice(0, d.abutted ? 2 : 1),
    length: d.length, batch, pails: d.pails, pinQty: d.pinQty, photos: d.photos,
    operative: sess.operativeId, createdAt: Date.now(), gps: d.gps,
    qa: 'pending', qaNote: '', qaBy: '', qaAt: null,
  });
  db.S().lastBatch[st.id] = batch;
  db.clearDraft();

  main.innerHTML = `
    <div class="narrow" style="text-align:center;padding-top:24px">
      <div style="width:76px;height:76px;margin:0 auto 16px;border-radius:50%;background:var(--green-bg);color:var(--green);display:flex;align-items:center;justify-content:center">${I.check.replace('<svg', '<svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="2.6"')}</div>
      <p class="eyebrow">Saved on this device</p>
      <h1>HP ${String(no).padStart(2, '0')} recorded</h1>
      <p class="muted">${esc(st.name)} · ${esc(el.name)} · ${esc(d.pin.level || d.level)}<br>Sent to the back office for QA.</p>
      <a class="btn block" href="#/records" style="margin-top:16px">View my records</a>
    </div>`;
  const bar = setAction(main, '<button type="button" class="btn primary" id="again">Next hold point here</button>');
  bar.querySelector('#again').addEventListener('click', () => {
    const nd = newDraft(st.id);
    Object.assign(nd, { elevationId: el.id, step: 1, cavityDepth: d.cavityDepth, socks: [...d.socks], abutted: d.abutted, pinQty: d.pinQty, pails: d.pails });
    db.saveDraft(nd);
    drawStep(ctx, nd);
  });
  toast(`HP ${String(no).padStart(2, '0')} saved`);
}

// ---------- Daily ----------
export function viewDaily(ctx, params) {
  const { main, sess } = ctx;
  const sites = db.sitesFor(sess);
  const key = 'injectatrace.dailySite';
  let siteId = params.get('site') || sessionStorage.getItem(key) || sites[0]?.id;
  if (!sites.find((x) => x.id === siteId)) siteId = sites[0]?.id;
  try { sessionStorage.setItem(key, siteId); } catch { /* ignore */ }
  const st = db.site(siteId);
  if (!st) { main.innerHTML = '<p class="empty card">No live sites assigned.</p>'; setAction(main, null); return; }
  const d = db.dayFor(st.id);
  const hrs = Object.values(d?.hours || {}).reduce((a, b) => a + b, 0);
  const checks = d?.checks?.filter(Boolean).length || 0;
  const blocked = !db.ramsSigned(st, sess.operativeId);

  const tile = (id, title, sub, ok, icon) => `
    <button type="button" class="card cardlink" data-open="${id}" style="width:100%;text-align:left;font:inherit;color:inherit;cursor:pointer;margin:0;min-height:96px" ${blocked ? 'disabled' : ''}>
      <div class="spread top">
        <div style="display:flex;gap:14px;align-items:flex-start">
          <span style="width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex:none;background:${ok ? 'var(--green-bg)' : 'var(--tint)'};color:${ok ? 'var(--green)' : 'var(--navy)'}">${icon.replace('<svg', '<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"')}</span>
          <div><h3 style="margin:2px 0 2px">${title}</h3><div class="muted small">${sub}</div></div>
        </div>
        ${ok ? `<span class="chip c-green">${I.check}Done</span>` : '<span class="chip c-orange"><span class="dot" style="color:var(--orange)"></span>Needed</span>'}
      </div>
    </button>`;

  main.innerHTML = `
    <p class="eyebrow">Daily record · <span class="mono">${new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span></p>
    <div class="pagehead"><h1>Daily checks</h1></div>
    ${sites.length > 1 ? `<div class="field"><label for="dsite" class="sr">Site</label><select id="dsite">${sites.map((x) => `<option value="${x.id}" ${x.id === st.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>` : `<p><strong>${esc(st.name)}</strong></p>`}
    ${blocked ? `<div class="card warn"><p><strong>Sign this week's RAMS (rev ${st.rams.rev}) first.</strong></p><button class="btn accent block" id="sign">${I.pen}Sign RAMS rev ${st.rams.rev}</button></div>` : ''}
    <div class="stack grid2">
      ${tile('am', 'AM temperatures', d?.am ? `Recorded ${time(d.am.at)} · GPS logged` : 'Ambient, cavity, pail, storage', !!d?.am, I.daily)}
      ${tile('pm', 'PM temperatures', d?.pm ? `Recorded ${time(d.pm.at)} · GPS logged` : 'Ambient, cavity, pail, storage', !!d?.pm, I.daily)}
      ${tile('hs', 'H&amp;S', d ? `${checks}/${db.HS_CHECKS.length} checks${d.toolbox ? ' · toolbox talk' : ''}${d.incident ? ' · incident logged' : ''}` : 'Checklist, toolbox talk, incidents', checks === db.HS_CHECKS.length, I.qa)}
      ${tile('hours', 'Hours worked', hrs ? `${hrs} h logged for ${Object.keys(d.hours).length} operatives` : 'For weekly reporting', hrs > 0, I.clock)}
      ${tile('diary', 'Video diary', d?.diary ? 'Recorded' : '30 seconds on today\'s works', !!d?.diary, I.video)}
    </div>`;

  main.querySelector('#dsite')?.addEventListener('change', (e) => { location.hash = `#/daily?site=${e.target.value}`; });
  main.querySelector('#sign')?.addEventListener('click', () => ramsSheet(st, sess.operativeId, ctx.render));
  main.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => dailySheet(ctx, st, b.dataset.open)));
  setAction(main, null);
}

function dailySheet(ctx, st, which) {
  const d = db.dayFor(st.id);
  const prev = db.S().days.filter((x) => x.siteId === st.id && x[which === 'pm' ? 'pm' : 'am']).sort((a, b) => b.date.localeCompare(a.date))[0];
  const rerender = () => ctx.render();

  if (which === 'am' || which === 'pm') {
    const cur = d?.[which] || {};
    const base = prev?.[which] || {};
    openSheet({
      title: `${which.toUpperCase()} temperatures`,
      body: `
        <p class="muted small" id="gps">${I.gps.replace('<svg', '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px"')} Getting location…</p>
        ${db.TEMPS.map((t) => `<div class="field"><label for="t_${t.key}">${t.label}</label>${stepper(`t_${t.key}`, cur[t.key] ?? base[t.key] ?? '', { step: 0.5, min: -20, max: 60, label: `${t.label} temperature`, unit: '°C' })}</div>`).join('')}
        <p class="hint">Pre-filled from the last reading. Adjust with − / + or type.</p>`,
      primary: 'Save readings',
      onOpen: (sh) => {
        wireSteppers(sh);
        locate().then((g) => { sh._gps = g; const el = sh.querySelector('#gps'); if (el) el.lastChild.textContent = ` ${gpsText(g)}`; });
      },
      onPrimary: (sh) => {
        const r = Object.fromEntries(db.TEMPS.map((t) => [t.key, sh.querySelector(`#t_${t.key}`).value === '' ? null : +sh.querySelector(`#t_${t.key}`).value]));
        if (Object.values(r).some((v) => v == null)) { toast('Enter all four temperatures'); return false; }
        db.upsertDay(st.id, { [which]: { ...r, at: Date.now(), gps: sh._gps ?? null } });
        toast(`${which.toUpperCase()} readings saved`);
        rerender();
      },
    });
  }

  if (which === 'hs') {
    const cur = d || { checks: db.HS_CHECKS.map(() => false), toolbox: '', incident: '' };
    openSheet({
      title: 'H&S',
      body: `
        <p class="eyebrow">Daily checklist</p>
        ${db.HS_CHECKS.map((c, i) => `<label class="toggle"><span>${esc(c)}</span><input type="checkbox" data-c="${i}" ${cur.checks?.[i] ? 'checked' : ''}></label>`).join('')}
        <div class="field" style="margin-top:16px"><label for="tb">Toolbox talk delivered</label>
          <select id="tb"><option value="">None today</option>${db.TOOLBOX_TOPICS.map((t) => `<option ${t === cur.toolbox ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
        <label class="toggle"><span>Any incident to report?</span><input type="checkbox" id="inc" ${cur.incident ? 'checked' : ''}></label>
        <div id="incbox" ${cur.incident ? '' : 'hidden'}><div class="field"><label for="incd">What happened?</label><textarea id="incd" rows="3">${esc(cur.incident)}</textarea></div></div>`,
      primary: 'Save H&S',
      onOpen: (sh) => sh.querySelector('#inc').addEventListener('change', (e) => { sh.querySelector('#incbox').hidden = !e.target.checked; }),
      onPrimary: (sh) => {
        db.upsertDay(st.id, {
          checks: db.HS_CHECKS.map((_, i) => sh.querySelector(`[data-c="${i}"]`).checked),
          toolbox: sh.querySelector('#tb').value,
          incident: sh.querySelector('#inc').checked ? sh.querySelector('#incd').value.trim() || 'Incident reported (no details)' : '',
        });
        toast('H&S saved');
        rerender();
      },
    });
  }

  if (which === 'hours') {
    const cur = d?.hours || {};
    openSheet({
      title: 'Hours worked',
      body: `${st.team.map((o) => `<div class="field"><label for="h_${o}">${esc(db.operative(o).name)}</label>${stepper(`h_${o}`, cur[o] ?? 8, { step: 0.5, min: 0, max: 16, label: `Hours for ${db.operative(o).name}`, unit: 'h' })}</div>`).join('')}
        <p class="hint">Rolled up into weekly hours in the back office.</p>`,
      primary: 'Save hours',
      onOpen: (sh) => wireSteppers(sh),
      onPrimary: (sh) => {
        const hours = Object.fromEntries(st.team.map((o) => [o, +sh.querySelector(`#h_${o}`).value || 0]).filter(([, h]) => h > 0));
        db.upsertDay(st.id, { hours });
        toast('Hours saved');
        rerender();
      },
    });
  }

  if (which === 'diary') {
    openSheet({
      title: 'Video diary',
      body: `
        <p>Record about 30 seconds explaining the works completed today.</p>
        <div id="prev" style="margin-bottom:12px"></div>
        <label class="capture"><input type="file" accept="video/*" capture="user" id="vid" aria-label="Record video diary"><span class="btn primary block">${I.video}${d?.diary ? 'Record again' : 'Record video'}</span></label>`,
      primary: null,
      onOpen: async (sh, close) => {
        if (d?.diary?.id) {
          const u = await fileURL(d.diary.id);
          if (u) sh.querySelector('#prev').innerHTML = `<video src="${u}" controls playsinline style="width:100%;border-radius:12px;max-height:240px;background:#000"></video>`;
        } else if (d?.diary?.sample) sh.querySelector('#prev').innerHTML = '<p class="muted small">Sample diary on file.</p>';
        sh.querySelector('#vid').addEventListener('change', async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const v = await storeCapture(f);
            db.upsertDay(st.id, { diary: { ...v, at: Date.now() } });
            toast('Video diary saved');
            close(); rerender();
          } catch { toast('Could not save video. Storage may be full.'); }
        });
      },
    });
  }
}

// ---------- Records ----------
export function viewRecords(ctx, params) {
  const { main, sess } = ctx;
  const f = params.get('f') || 'all';
  const mine = db.S().pins.filter((p) => p.operative === sess.operativeId).sort((a, b) => b.createdAt - a.createdAt);
  const counts = { all: mine.length, pending: 0, rejected: 0, approved: 0 };
  mine.forEach((p) => counts[p.qa]++);
  const list = mine.filter((p) => f === 'all' || p.qa === f).slice(0, 80);
  const tabs = [['all', 'All'], ['rejected', 'Rework'], ['pending', 'Awaiting QA'], ['approved', 'Passed']];

  main.innerHTML = `
    <p class="eyebrow">Your hold points</p>
    <div class="pagehead"><h1>Records</h1></div>
    <nav class="tabs" aria-label="Filter">${tabs.map(([k, l]) => `<a href="#/records?f=${k}" ${k === f ? 'aria-current="page"' : ''}>${l}${k === 'rejected' && counts.rejected ? ` <span class="count">${counts.rejected}</span>` : ` <span class="mono small">${counts[k]}</span>`}</a>`).join('')}</nav>
    <div class="stack">${list.map((p) => pinCard(p)).join('') || '<p class="empty card">Nothing here.</p>'}</div>`;
  setAction(main, null);
}

export function pinCard(p, { showSite = true } = {}) {
  const st = db.site(p.siteId);
  const el = db.elevation(st, p.elevationId);
  const gaps = db.photoGaps(p).length;
  return `
    <a class="card cardlink" href="#/pin/${p.id}">
      <div class="spread"><p class="eyebrow" style="margin:0">${showSite ? `${esc(st.name)}` : esc(el?.name)}</p><span class="muted small">${ago(p.createdAt)}</span></div>
      <h3 style="margin:6px 0 2px"><span class="mono">${db.pinLabel(p)}</span>${showSite ? ` · ${esc(el?.name)}` : ''} · ${esc(p.level)}</h3>
      <p class="muted small" style="margin:0 0 10px">${num(p.length)} m · <span class="mono">${p.socks.map((s) => `${s}mm`).join('+')}</span> · ${p.pinQty} pins</p>
      <div class="row" style="gap:8px">${qaChip(p.qa)}${gaps ? `<span class="chip c-red">${I.camera}${gaps} photo gap${gaps > 1 ? 's' : ''}</span>` : ''}</div>
      ${p.qa === 'rejected' && p.qaNote ? `<p class="small" style="margin:10px 0 0;padding:8px 10px;border-radius:10px;background:var(--red-bg);color:var(--red);font-weight:600">${esc(p.qaNote)}</p>` : ''}
    </a>`;
}

export { wordmark };
