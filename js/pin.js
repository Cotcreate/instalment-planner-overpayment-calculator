// Hold point detail. Shared by all roles:
//  office: QA pass (red -> green) or send back for rework
//  installer: see QA notes, add missing photos, resubmit
//  client: read-only, no pail quantities or costs
import * as db from './store.js';
import { mountElevation } from './elevation.js';
import { fileURL } from './files.js';
import { esc, num, I, date, time, toast, setAction, openSheet, qaChip, gpsText, gbp } from './ui.js';
import { shotTiles, storeCapture } from './installer.js';

const REWORK_REASONS = [
  'Photo missing or unclear',
  'Injected sock photo does not show abutment to slab',
  'Cavity measure photo does not show depth',
  'Access holes not reinstated',
  'Batch number does not match delivery',
];

export async function viewPin(ctx, id) {
  const { main, sess } = ctx;
  const p = db.pin(id);
  if (!p) { main.innerHTML = '<p class="empty card">Hold point not found.</p>'; setAction(main, null); return; }
  const st = db.site(p.siteId);
  const el = db.elevation(st, p.elevationId);
  const role = sess.role;
  const by = db.operative(p.operative);
  const gaps = db.photoGaps(p);
  const materials = p.socks.reduce((t, mm) => t + (db.SOCK_RATE[mm] || 0) * p.length, 0);
  const canFix = role === 'installer' && p.qa === 'rejected' && p.operative === sess.operativeId;
  const backHref = role === 'installer' ? '#/records' : role === 'office' && p.qa === 'pending' ? '#/qa' : `#/sites/${st.id}/pins`;

  const row = (k, v) => `<li><span class="k">${k}</span><span class="v">${v}</span></li>`;
  main.innerHTML = `
    <a class="btn sm ghost" href="${backHref}" style="margin:-8px 0 8px -12px">${I.back}Back</a>
    <p class="eyebrow">Project · ${esc(st.name)}</p>
    <div class="spread top" style="margin-bottom:6px"><h1 style="margin:0">Hold point ${String(p.no).padStart(2, '0')}</h1>${qaChip(p.qa)}</div>
    <p class="muted">${esc(el.name)} · ${esc(p.level)}${p.bay ? ` · bay ${p.bay}` : ''} · pin line</p>
    ${p.qa === 'rejected' && p.qaNote ? `<div class="card" style="border-color:var(--red);box-shadow:inset 0 0 0 1px var(--red)"><p class="eyebrow" style="color:var(--red)">Rework requested${p.qaAt ? ` · ${date(p.qaAt)}` : ''}</p><p style="margin:0;font-weight:600">${esc(p.qaNote)}</p></div>` : ''}
    <div class="split">
      <div>
        <div class="card">
          <ul class="list">
            ${row('Cavity depth', `${p.cavityDepth} mm`)}
            ${row(`Sock${p.socks.length > 1 ? 's (abutted)' : ''}`, `<span class="mono">${p.socks.map((s) => `${s}mm`).join(' + ')}</span>`)}
            ${row('Injected length', `${num(p.length)} m`)}
            ${row('Pins installed', p.pinQty)}
            ${row('Pail batch', `<span class="mono">[${esc(p.batch)}]</span>`)}
            ${role !== 'client' ? row('Pails used', p.pails) : ''}
            ${role === 'office' ? row('Materials cost', gbp(materials)) : ''}
            ${row('Photographs', gaps.length ? `<span style="color:var(--red)">${db.PHOTO_HEADINGS.length - gaps.length} / ${db.PHOTO_HEADINGS.length} headings</span>` : `${Object.values(p.photos).flat().length} added`)}
            ${row('Installed by', esc(by?.name || '—'))}
            ${row('Recorded', `${date(p.createdAt)} ${time(p.createdAt)}`)}
            ${row('GPS', `<span class="mono small">${gpsText(p.gps)}</span>`)}
            ${p.qaBy && p.qa === 'approved' ? row('QA passed', `${date(p.qaAt)}`) : ''}
          </ul>
        </div>
        <div id="elev" style="margin-bottom:14px"></div>
      </div>
      <div class="card" id="photos">
        <p class="eyebrow">Trail</p>
        ${db.PHOTO_HEADINGS.map((h) => `
          <section class="shotrow" data-h="${h.key}">
            <div class="head"><div><h3>${esc(h.label)}</h3>${h.hint ? `<div class="muted small">${esc(h.hint)}</div>` : ''}</div>
              ${(p.photos[h.key] || []).length ? `<span class="chip c-green">${I.check}${p.photos[h.key].length}</span>` : '<span class="chip c-red"><span class="dot"></span>Missing</span>'}</div>
            <div class="shots"></div>
            ${canFix ? `<label class="capture" style="margin-top:10px"><input type="file" accept="image/*${h.video ? ',video/*' : ''}" capture="environment" data-k="${h.key}" aria-label="Add ${esc(h.label)} photo"><span class="btn sm block">${I.camera}Add photo</span></label>` : ''}
          </section>`).join('')}
      </div>
    </div>`;

  for (const h of db.PHOTO_HEADINGS) {
    const sec = main.querySelector(`[data-h="${h.key}"] .shots`);
    shotTiles(p.photos[h.key] || []).then((html) => { sec.innerHTML = html; });
  }
  main.querySelector('#photos').addEventListener('click', async (e) => {
    const tile = e.target.closest('.shot:not(.sample)');
    if (!tile) return;
    const media = tile.querySelector('img,video');
    if (media) openSheet({ title: 'Photo', body: media.tagName === 'VIDEO' ? `<video src="${media.src}" controls playsinline style="width:100%;border-radius:12px;background:#000"></video>` : `<img src="${media.src}" alt="" style="width:100%;border-radius:12px">`, primary: null });
  });

  const image = el.image ? await fileURL(el.image.id).then((u) => (u ? { url: u, w: el.image.w, h: el.image.h } : null)) : null;
  const m = mountElevation(main.querySelector('#elev'), { el, pins: [p], image });
  m.select(p.id);
  ctx.cleanups.push(m.destroy);

  if (canFix) {
    main.querySelectorAll('input[type=file]').forEach((inp) => inp.addEventListener('change', async () => {
      const f = inp.files?.[0];
      if (!f) return;
      try {
        const v = await storeCapture(f);
        (p.photos[inp.dataset.k] ||= []).push(v);
        db.persist();
        toast('Photo added');
        viewPin(ctx, id);
      } catch { toast('Could not save photo.'); }
    }));
    const bar = setAction(main, '<button class="btn primary" id="resubmit">Resubmit for QA</button>');
    bar.querySelector('#resubmit').addEventListener('click', () => {
      db.updatePin(p.id, { qa: 'pending', qaNote: '', qaAt: null });
      toast(`${db.pinLabel(p)} resubmitted`);
      location.hash = '#/records';
    });
  } else if (role === 'office') {
    const bar = setAction(main, `
      <button class="btn danger secondary" id="rework">${p.qa === 'rejected' ? 'Edit note' : 'Rework'}</button>
      <button class="btn good" id="pass" ${p.qa === 'approved' ? 'disabled' : ''}>${I.check}${p.qa === 'approved' ? 'QA passed' : 'Pass QA'}</button>`);
    bar.querySelector('#pass').addEventListener('click', () => {
      db.updatePin(p.id, { qa: 'approved', qaNote: '', qaBy: sess.name, qaAt: Date.now() });
      toast(`${db.pinLabel(p)} passed QA`);
      const nextPending = db.S().pins.find((x) => x.qa === 'pending' && x.siteId === p.siteId);
      location.hash = nextPending ? `#/pin/${nextPending.id}` : '#/qa';
    });
    bar.querySelector('#rework').addEventListener('click', () => openSheet({
      title: `Rework ${db.pinLabel(p)}`,
      body: `
        <fieldset class="field"><legend>Reason</legend>
          <div class="stack" style="gap:8px">${[...REWORK_REASONS, ...gaps.map((g) => `Missing photo: ${g.label}`)].map((r, i) => `<label class="choice"><input type="radio" name="why" value="${esc(r)}" ${i === 0 && !p.qaNote ? 'checked' : r === p.qaNote ? 'checked' : ''}><span style="justify-content:flex-start;text-align:left;padding:10px 14px">${esc(r)}</span></label>`).join('')}</div>
        </fieldset>
        <div class="field"><label for="note">Note to installer <span class="muted">(optional)</span></label><textarea id="note" rows="2"></textarea></div>`,
      primary: 'Send back for rework',
      onPrimary: (sh) => {
        const why = sh.querySelector('[name=why]:checked')?.value || 'Rework required';
        const note = sh.querySelector('#note').value.trim();
        db.updatePin(p.id, { qa: 'rejected', qaNote: note ? `${why}. ${note}` : why, qaBy: sess.name, qaAt: Date.now() });
        toast(`${db.pinLabel(p)} sent back`);
        viewPin(ctx, id);
      },
    }));
  } else setAction(main, null);
}
