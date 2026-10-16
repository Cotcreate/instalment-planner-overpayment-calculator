// Hold point detail. Shared by all roles:
//  manager / office: QA pass (red -> green) or send back for rework
//  installer: see QA notes, add missing photos, resubmit
//  client: read-only, no pail quantities or costs
import * as db from './store.js';
import { mountElevation } from './elevation.js';
import { fileURL } from './files.js';
import { esc, num, I, date, time, toast, setAction, openSheet, qaChip, gpsText, gbp, spec, avatar } from './ui.js';
import { shotTiles, storeCapture } from './installer.js';

const REWORK_REASONS = [
  'Photo missing or unclear',
  'Injected sock photo does not show abutment to slab',
  'Cavity measure photo does not show depth',
  'Access holes not reinstated',
  'Batch number does not match delivery',
];

async function firstMedia(list) {
  const real = (list || []).find((x) => x.id);
  if (!real) return '';
  const u = await fileURL(real.id);
  if (!u) return '';
  return real.kind === 'video' ? `<video src="${u}" muted playsinline preload="metadata"></video>` : `<img src="${u}" alt="">`;
}

export async function viewPin(ctx, id) {
  const { main, sess } = ctx;
  const p = db.pin(id);
  const st = p && db.site(p.siteId);
  if (!p || !db.sitesFor(sess).concat(sess.role === 'installer' ? db.S().sites : []).includes(st)) { main.innerHTML = '<p class="empty card">Hold point not found.</p>'; setAction(main, null); return; }
  const el = db.elevation(st, p.elevationId);
  const role = sess.role;
  const isStaff = role === 'manager' || role === 'office';
  const by = db.operative(p.operative);
  const gaps = db.photoGaps(p);
  const materials = p.socks.reduce((t, mm) => t + (db.SOCK_RATE[mm] || 0) * p.length, 0);
  const canFix = role === 'installer' && p.qa === 'rejected' && p.operative === sess.operativeId;
  const backHref = role === 'installer' ? '#/records' : isStaff && p.qa === 'pending' ? '#/qa' : `#/jobs/${st.id}/pins`;
  const nPhotos = Object.values(p.photos).flat().length;

  main.innerHTML = `
    <a class="btn sm ghost" href="${backHref}" style="margin:-8px 0 8px -12px">${I.back}Back</a>
    <p class="eyebrow">${esc(st.name)}</p>
    <div class="spread top" style="margin-bottom:4px"><h1 style="margin:0">Hold point <span class="mono">${String(p.no).padStart(2, '0')}</span></h1>${qaChip(p.qa)}</div>
    <p class="muted">${esc(el.name)} · ${esc(p.level)}${p.bay ? ` · bay ${p.bay}` : ''} · ${date(p.createdAt)}</p>
    ${p.qa === 'rejected' && p.qaNote ? `<div class="card" style="border-color:var(--red);box-shadow:inset 0 0 0 1px var(--red)"><p class="eyebrow" style="color:var(--red)">Rework requested${p.qaAt ? ` · ${date(p.qaAt)}` : ''}</p><p style="margin:0;font-weight:600">${esc(p.qaNote)}</p></div>` : ''}
    <div class="twocol">
      <div>
        ${spec([
          ['Cavity depth', `${p.cavityDepth}<small> mm</small>`],
          ['Injected', `${num(p.length)}<small> m</small>`],
          [`Sock${p.socks.length > 1 ? 's · abutted' : ''}`, `<span class="mono" style="font-size:17px">${p.socks.map((s) => `${s}mm`).join(' + ')}</span>`],
          ['Pins installed', p.pinQty],
          ['Pail batch', `<span class="mono" style="font-size:17px">${esc(p.batch)}</span>`],
          role !== 'client' ? ['Pails used', p.pails] : ['Photos', nPhotos],
          isStaff ? ['Materials', gbp(materials)] : null,
          isStaff ? ['Photos', `${nPhotos}${gaps.length ? ` <small style="color:var(--red)">${gaps.length} missing</small>` : ''}`] : null,
        ])}
        <div class="group">
          <div class="ri"><span class="ri-lead">${avatar(by?.name, 40)}</span><span class="ri-main"><span class="ri-title">${esc(by?.name || '—')}</span><span class="ri-sub">Installed ${time(p.createdAt)} · <span class="mono">${gpsText(p.gps)}</span></span></span></div>
          ${p.qa === 'approved' && p.qaAt ? `<div class="ri"><span class="ri-lead"><span class="bubble b-green">${I.check}</span></span><span class="ri-main"><span class="ri-title">QA passed</span><span class="ri-sub">${date(p.qaAt)}${p.qaBy ? ` · ${esc(p.qaBy)}` : ''}</span></span></div>` : ''}
        </div>
        <details class="disc" id="drawing"><summary><span>Show on ${esc(el.name)} drawing</span></summary><div style="padding:0 12px 12px"><div id="elev"></div></div></details>
      </div>
      <div>
        <div class="spread" style="margin:4px 0 10px"><h2 style="margin:0">Photos</h2><span class="muted small">${db.PHOTO_HEADINGS.length - gaps.length} of ${db.PHOTO_HEADINGS.length} headings</span></div>
        <div class="pgrid" id="photos">${db.PHOTO_HEADINGS.map((h) => {
          const n = (p.photos[h.key] || []).length;
          const add = canFix && !n;
          const tag = add ? 'label' : 'button type="button"';
          return `<${tag} class="ptile ${n ? '' : 'missing'}" data-h="${h.key}" ${add ? '' : `aria-label="${esc(h.label)}: ${n ? `${n} photo${n > 1 ? 's' : ''}` : 'missing'}"`}>
            <span class="ph">${n ? I.camera : add ? I.plus : I.alert}</span><span class="media"></span>
            ${n ? `<span class="n">${n}</span>` : ''}<span class="cap">${esc(h.label)}${!n ? `<br><small>${add ? 'Tap to add' : 'Missing'}</small>` : ''}</span>
            ${add ? `<input type="file" accept="image/*${h.video ? ',video/*' : ''}" capture="environment" data-k="${h.key}" aria-label="Add ${esc(h.label)} photo">` : ''}
          </${add ? 'label' : 'button'}>`;
        }).join('')}</div>
      </div>
    </div>`;

  for (const h of db.PHOTO_HEADINGS) firstMedia(p.photos[h.key]).then((m) => { if (m) main.querySelector(`.ptile[data-h="${h.key}"] .media`).outerHTML = m; });

  // Tap a heading to see all of its photos.
  main.querySelector('#photos').addEventListener('click', async (e) => {
    if (e.target.closest('input')) return;
    const t = e.target.closest('.ptile');
    const h = db.PHOTO_HEADINGS.find((x) => x.key === t?.dataset.h);
    const list = p.photos[h?.key] || [];
    if (!h || !list.length) return;
    openSheet({
      title: h.label,
      body: `${h.hint ? `<p class="muted small">${esc(h.hint)}</p>` : ''}<div class="shots" style="grid-template-columns:repeat(2,1fr)">${await shotTiles(list)}</div>
        ${canFix ? `<label class="capture" style="margin-top:12px"><input type="file" accept="image/*${h.video ? ',video/*' : ''}" capture="environment" data-k="${h.key}" aria-label="Add another"><span class="btn block">${I.camera}Add another</span></label>` : ''}`,
      primary: null,
      onOpen: (sh, close) => sh.querySelector('input[type=file]')?.addEventListener('change', (ev) => { close(); addPhoto(ev.target); }),
    });
  });

  // The drawing only mounts when opened, so it sizes correctly.
  let mounted = false;
  main.querySelector('#drawing').addEventListener('toggle', async (e) => {
    if (!e.target.open || mounted) return;
    mounted = true;
    const image = el.image ? await fileURL(el.image.id).then((u) => (u ? { url: u, w: el.image.w, h: el.image.h } : null)) : null;
    const m = mountElevation(main.querySelector('#elev'), { el, pins: [p], image });
    m.select(p.id);
    ctx.cleanups.push(m.destroy);
  });

  async function addPhoto(inp) {
    const f = inp.files?.[0];
    if (!f) return;
    try {
      const v = await storeCapture(f);
      (p.photos[inp.dataset.k] ||= []).push(v);
      db.persist(); toast('Photo added'); viewPin(ctx, id);
    } catch { toast('Could not save photo.'); }
  }

  if (canFix) {
    main.querySelectorAll('#photos input[type=file]').forEach((inp) => inp.addEventListener('change', () => addPhoto(inp)));
    const bar = setAction(main, '<button class="btn primary" id="resubmit">Resubmit for QA</button>');
    bar.querySelector('#resubmit').addEventListener('click', () => {
      db.updatePin(p.id, { qa: 'pending', qaNote: '', qaAt: null });
      toast(`${db.pinLabel(p)} resubmitted`);
      location.hash = '#/records';
    });
  } else if (isStaff) {
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
