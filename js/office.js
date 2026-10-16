// Jobs, job detail, QA queue and Team & compliance. Shared by contractor manager, back office and (read-only) clients.
import * as db from './store.js';
import { mountElevation } from './elevation.js';
import { putFile, fileURL, downscale } from './files.js';
import {
  esc, uid, num, I, gbp, gbpBig, date, dateShort, time, toast, setAction, openSheet, qaChip, expiryChip,
  readJSON, writeJSON, stepper, wireSteppers, avatar, ring, rowItem, iconBubble, sectionHead, spec, ago,
} from './ui.js';
import { jobRow } from './home.js';
import { quoteRow } from './quotes.js';
import { pinRow, pinBrowser } from './pinlist.js';

export { pinRow };

const staff = (ctx) => ctx.sess.role === 'manager' || ctx.sess.role === 'office';

async function uploadTo(input) {
  const f = input.files?.[0];
  if (!f) return null;
  const id = uid();
  await putFile(id, f.type.startsWith('image/') ? await downscale(f, 2400, 0.85).catch(() => f) : f);
  return { id, name: f.name, at: Date.now() };
}
const uploadIcon = (attrs, label) =>
  `<label class="capture"><input type="file" accept="application/pdf,image/*" ${attrs} aria-label="${esc(label)}"><span class="btn iconbtn">${I.upload}</span></label>`;
const uploadBtn = (attrs, label = 'Upload', accept = 'application/pdf,image/*') =>
  `<label class="capture"><input type="file" accept="${accept}" ${attrs} aria-label="${esc(label)}"><span class="btn sm">${I.upload}${esc(label)}</span></label>`;

// ---------- Jobs ----------
export function viewJobs(ctx, params) {
  const { main, sess } = ctx;
  const isStaff = staff(ctx);
  const f = params.get('f') || 'active';
  const fc = readJSON('injectatrace.jobClient', 'all');
  const all = db.sitesFor(sess).filter((s) => !isStaff || fc === 'all' || s.clientId === fc);
  const list = all.filter((s) => f === 'all' || s.status === f);

  main.innerHTML = `
    <div class="pagehead"><div><p class="eyebrow">${list.length} job${list.length === 1 ? '' : 's'}</p><h1>Jobs</h1></div>
      ${isStaff ? `<button class="btn primary sm" id="newjob">${I.plus}New job</button>` : ''}</div>
    <div class="spread" style="gap:10px;align-items:flex-start">
      <nav class="seg" aria-label="Filter jobs" style="flex:1">${[['active', 'Live'], ['complete', 'Complete'], ['all', 'All']].map(([k, l]) => `<a href="#/jobs?f=${k}" ${k === f ? 'aria-current="page"' : ''}>${l} <span class="n">${all.filter((s) => k === 'all' || s.status === k).length}</span></a>`).join('')}</nav>
      ${isStaff ? `<button type="button" class="btn iconbtn" id="filters" aria-label="Filter by client" style="margin-top:2px;background:${fc !== 'all' ? 'var(--navy)' : 'var(--white)'};color:${fc !== 'all' ? '#fff' : 'var(--navy)'}">${I.filter}</button>` : ''}
    </div>
    <div class="group">${list.map((s) => jobRow(s, { sess })).join('') || '<div class="empty">No jobs here.</div>'}</div>`;

  main.querySelector('#filters')?.addEventListener('click', () => openSheet({
    title: 'Filter jobs',
    body: `<div class="field"><label for="fc">Client</label><select id="fc"><option value="all">All clients</option>${db.S().clients.map((c) => `<option value="${c.id}" ${c.id === fc ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>`,
    primary: 'Show jobs', secondary: 'Reset',
    onPrimary: (sh) => { writeJSON('injectatrace.jobClient', sh.querySelector('#fc').value); ctx.render(); },
    onSecondary: (sh) => { sh.querySelector('#fc').value = 'all'; },
  }));
  main.querySelector('#newjob')?.addEventListener('click', () => newJobSheet(ctx));
  setAction(main, null);
}

function newJobSheet(ctx) {
  openSheet({
    title: 'New job',
    body: `
      <div class="field"><label for="jn">Job name</label><input id="jn" type="text"></div>
      <div class="field"><label for="jc">Client</label><select id="jc"><option value="">Choose client…</option>${db.S().clients.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="ja">Site address</label><input id="ja" type="text"></div>
      <fieldset class="field"><legend>Fire rating</legend><div class="choices c2">${db.FIRE_RATINGS.map((r, i) => `<label class="choice"><input type="radio" name="fr" value="${r}" ${i === 1 ? 'checked' : ''}><span>${r} min</span></label>`).join('')}</div></fieldset>
      <fieldset class="field"><legend>Elevations</legend><div class="choices c2">${['North', 'East', 'South', 'West'].map((e) => `<label class="choice"><input type="checkbox" name="el" value="${e}" checked><span>${e}</span></label>`).join('')}</div></fieldset>
      <fieldset class="field"><legend>Assign installers</legend><div class="group" style="margin:0">${db.S().operatives.map((o) => rowItem({ lead: avatar(o.name, 36), title: esc(o.name), sub: esc(o.role), trail: `<input type="checkbox" name="op" value="${o.id}" aria-label="Assign ${esc(o.name)}" style="width:24px;height:24px">` })).join('')}</div></fieldset>`,
    primary: 'Create job',
    onPrimary: (sh) => {
      const name = sh.querySelector('#jn').value.trim();
      const clientId = sh.querySelector('#jc').value;
      const team = [...sh.querySelectorAll('[name=op]:checked')].map((x) => x.value);
      const els = [...sh.querySelectorAll('[name=el]:checked')].map((x) => x.value);
      if (!name || !clientId || !team.length || !els.length) { toast('Add a name, client, elevation and installer'); return false; }
      const st = db.createJob({ name, clientId, address: sh.querySelector('#ja').value.trim(), fireRating: +sh.querySelector('[name=fr]:checked').value, elevations: els, team });
      toast('Job created'); location.hash = `#/jobs/${st.id}`;
    },
  });
}

// ---------- Job detail ----------
export async function viewJob(ctx, id, tab = 'overview', params) {
  const { main, sess } = ctx;
  const isStaff = staff(ctx);
  const st = db.site(id);
  if (!st || !db.sitesFor(sess).includes(st)) { main.innerHTML = '<p class="empty card">Job not found.</p>'; setAction(main, null); return; }
  const s = db.siteStats(st);
  const issues = isStaff ? s.missingDocs.length + s.unsigned.length : 0;
  const tabs = [['overview', 'Overview'], ['pins', 'Hold points'], ['daily', 'Daily'], ['docs', 'Documents'], ...(isStaff ? [['team', 'Team']] : [])];
  if (!tabs.find((t) => t[0] === tab)) tab = 'overview';

  main.innerHTML = `
    <a class="btn sm ghost" href="#/jobs" style="margin:-8px 0 8px -12px">${I.back}Jobs</a>
    <p class="eyebrow">${esc(db.clientName(st))} · FR ${st.fireRating} min</p>
    <h1 style="margin-bottom:4px">${esc(st.name)}</h1>
    <p class="muted">${esc(st.address || '')}</p>
    <section class="card" style="display:flex;gap:16px;align-items:center">
      ${ring(s.pct, 76, `${s.pct}% QA passed`)}
      <dl class="ministats">
        <div><dt>Passed</dt><dd>${s.approved}<small>/${st.targetPins}</small></dd></div>
        <div><dt>${isStaff ? 'To QA' : 'Review'}</dt><dd style="${s.pending && isStaff ? 'color:var(--red)' : ''}">${s.pending}</dd></div>
        <div><dt>Injected</dt><dd>${Math.round(s.lm)}<small>m</small></dd></div>
      </dl>
    </section>
    <nav class="seg" aria-label="Job sections">${tabs.map(([k, l]) => `<a href="#/jobs/${st.id}/${k}" ${k === tab ? 'aria-current="page"' : ''}>${l}${k === 'pins' && s.pending && isStaff ? ` <span class="chip c-red" style="padding:1px 7px;font-size:12px">${s.pending}</span>` : ''}${k === 'docs' && issues ? ` <span class="chip c-amber" style="padding:1px 7px;font-size:12px">${issues}</span>` : ''}</a>`).join('')}</nav>
    <div id="tab"></div>`;
  const host = main.querySelector('#tab');
  main.querySelector('.seg [aria-current]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  setAction(main, null);

  if (tab === 'overview') await jobOverview(ctx, st, host);
  if (tab === 'pins') jobPins(ctx, st, host, params);
  if (tab === 'daily') jobDaily(ctx, st, host);
  if (tab === 'docs') jobDocs(ctx, st, host);
  if (tab === 'team') jobTeam(ctx, st, host);
}

async function jobOverview(ctx, st, host) {
  const isStaff = staff(ctx);
  const key = `injectatrace.elev.${st.id}`;
  const el = db.elevation(st, readJSON(key, st.elevations[0].id)) || st.elevations[0];
  const allPins = db.pinsFor(st.id).filter((p) => p.elevationId === el.id);
  const view = { show: 'all', labels: false, ...readJSON('injectatrace.drawview', {}) };
  const visible = () => allPins.filter((p) => view.show === 'all' || (view.show === 'green') === (p.qa === 'approved'));
  const pins = visible();
  const q = st.quoteId ? db.quote(st.quoteId) : null;
  host.innerHTML = `
    <div class="twocol">
      <div>
        ${st.elevations.length > 1 ? `<div class="seg" role="group" aria-label="Elevation">${st.elevations.map((e) => `<button type="button" data-el="${e.id}" aria-pressed="${e.id === el.id}">${esc(e.name)}</button>`).join('')}</div>` : `<p class="eyebrow">${esc(el.name)} elevation</p>`}
        <div id="elev"></div>
        <div class="drawopts">
          <div class="seg" role="group" aria-label="Pins to show" style="margin:0;flex:1">${[['all', `All <span class="n">${allPins.length}</span>`], ['red', `<span class="dot" style="color:var(--red)"></span>Red <span class="n">${allPins.filter((p) => p.qa !== 'approved').length}</span>`], ['green', `<span class="dot" style="color:var(--green)"></span>Green <span class="n">${allPins.filter((p) => p.qa === 'approved').length}</span>`]].map(([k, l]) => `<button type="button" data-show="${k}" aria-pressed="${view.show === k}">${l}</button>`).join('')}</div>
          <label class="toggle" style="flex:1 1 100%;gap:10px"><span>Show hold point numbers</span><input type="checkbox" id="lbl" ${view.labels ? 'checked' : ''}></label>
        </div>
        <p class="legend" style="margin-top:6px"><span><span class="dot" style="color:var(--red)"></span>Awaiting QA or rework</span><span><span class="dot" style="color:var(--green)"></span>QA passed</span><a href="#/jobs/${st.id}/pins" style="margin-left:auto">List view</a></p>
        <div id="picked" aria-live="polite" style="margin-top:12px"></div>
      </div>
      <div>
        ${isStaff ? `
        <details class="disc">
          <summary><span style="display:flex;gap:12px;align-items:center">${iconBubble(I.pen, 'slate')}Job settings</span></summary>
          <div style="padding:4px 16px 16px">
            <div class="field"><label for="fr">Fire rating</label><select id="fr">${db.FIRE_RATINGS.map((r) => `<option value="${r}" ${r === st.fireRating ? 'selected' : ''}>${r} minutes</option>`).join('')}</select></div>
            <div class="field"><label for="tp">Target hold points</label>${stepper('tp', st.targetPins, { step: 5, min: 5, max: 2000, label: 'Target hold points', unit: 'HP' })}</div>
            <div class="field" style="margin:0"><span class="label">${esc(el.name)} drawing</span>${uploadBtn('id="draw"', el.image ? 'Replace marked-up drawing' : 'Upload marked-up drawing', 'image/*')}</div>
          </div>
        </details>` : ''}
        ${q && isStaff ? `${sectionHead('From quote')}<div class="group">${quoteRow(q)}</div>` : ''}
      </div>
    </div>`;

  host.querySelectorAll('[data-el]').forEach((b) => b.addEventListener('click', () => { writeJSON(key, b.dataset.el); ctx.render(); }));
  host.querySelector('#fr')?.addEventListener('change', (e) => { st.fireRating = +e.target.value; db.persist(); toast(`Fire rating set to ${st.fireRating} min`); });
  if (isStaff) wireSteppers(host, (k, v) => { if (k === 'tp' && v > 0) { st.targetPins = v; db.persist(); } });
  host.querySelector('#draw')?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const blob = await downscale(f, 2400, 0.85).catch(() => f);
    const bmp = await createImageBitmap(blob);
    const id = uid();
    await putFile(id, blob);
    el.image = { id, w: bmp.width, h: bmp.height };
    (st.docs.elevations ||= []).push({ id, name: f.name, at: Date.now() });
    db.persist(); toast('Drawing uploaded'); ctx.render();
  });

  const image = el.image ? await fileURL(el.image.id).then((u) => (u ? { url: u, w: el.image.w, h: el.image.h } : null)) : null;
  const m = mountElevation(host.querySelector('#elev'), {
    el, pins, image, labels: view.labels,
    onSelect: (pid) => {
      const p = allPins.find((x) => x.id === pid);
      host.querySelector('#picked').innerHTML = p ? `<div class="group">${pinRow(p)}</div>` : '';
    },
  });
  ctx.cleanups.push(m.destroy);

  const saveView = () => writeJSON('injectatrace.drawview', view);
  host.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => {
    view.show = b.dataset.show; saveView();
    host.querySelectorAll('[data-show]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    m.update({ pins: visible() });
  }));
  host.querySelector('#lbl').addEventListener('change', (e) => { view.labels = e.target.checked; saveView(); m.update({ labels: view.labels }); });
}

function jobPins(ctx, st, host) {
  pinBrowser(host, { pins: db.pinsFor(st.id), key: st.id });
}

function jobDaily(ctx, st, host) {
  const isStaff = staff(ctx);
  const days = db.S().days.filter((d) => d.siteId === st.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);
  const week = db.isoWeek();
  const hours = {};
  db.S().days.filter((d) => d.siteId === st.id && db.isoWeek(new Date(d.date)) === week).forEach((d) => Object.entries(d.hours || {}).forEach(([o, h]) => { hours[o] = (hours[o] || 0) + h; }));
  const maxH = Math.max(40, ...Object.values(hours));
  host.innerHTML = `
    <div class="twocol">
      <div>
        ${days.map((d) => {
          const hrs = Object.values(d.hours || {}).reduce((a, b) => a + b, 0);
          const ok = d.am && d.pm;
          const c = db.dayCost(d);
          return `
          <details class="disc">
            <summary>
              <span style="display:flex;gap:12px;align-items:center;min-width:0">${iconBubble(d.incident ? I.alert : ok ? I.check : I.daily, d.incident ? 'red' : ok ? 'green' : 'orange')}
                <span style="min-width:0"><span style="display:block">${new Date(d.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span class="small muted" style="font-weight:400">${ok ? 'AM + PM temps' : 'Temps incomplete'} · ${hrs} h${d.incident ? ' · incident' : ''}</span></span></span>
            </summary>
            <div style="padding:0 16px 16px">
              ${['am', 'pm'].map((w) => `<p class="eyebrow" style="margin:6px 0">${w.toUpperCase()}${d[w] ? ` · ${time(d[w].at)}${d[w].gps ? ' · GPS ✓' : ''}` : ' · not recorded'}</p>
                ${d[w] ? spec(db.TEMPS.map((t) => [t.label, `${d[w][t.key]}°`])) : ''}`).join('')}
              ${spec([
                ['H&amp;S checks', `${(d.checks || []).filter(Boolean).length}/${db.HS_CHECKS.length}`],
                ['Toolbox talk', d.toolbox ? esc(d.toolbox) : '—'],
                ['Video diary', d.diary ? 'Recorded' : '—'],
                isStaff ? ['Cost', `${gbp(c.total)}<small> L ${gbp(c.labour)} · M ${gbp(c.materials)}</small>`] : ['Hours', `${hrs} h`],
              ])}
              ${d.incident ? `<p class="small" style="margin:0;padding:10px 12px;border-radius:12px;background:var(--red-bg);color:var(--red);font-weight:600">${esc(d.incident)}</p>` : ''}
            </div>
          </details>`;
        }).join('') || '<p class="empty card">No daily records yet.</p>'}
      </div>
      <section class="card">
        <p class="eyebrow">Hours this week · W${week.split('-W')[1]}</p>
        <ul class="bars">${st.team.map((o) => `<li><span class="lbl">${esc(db.operative(o).name)}</span><span class="val">${hours[o] || 0} h${isStaff ? ` <span class="muted small">${gbp((hours[o] || 0) * db.operative(o).rate)}</span>` : ''}</span><span class="track"><i style="width:${((hours[o] || 0) / maxH) * 100}%"></i></span></li>`).join('')}</ul>
      </section>
    </div>`;
}

function jobDocs(ctx, st, host) {
  const isStaff = staff(ctx);
  const week = db.isoWeek();
  const signed = st.team.filter((o) => db.ramsSigned(st, o)).length;
  const req = db.SITE_DOCS.filter((d) => d.required && d.key !== 'rams');
  const sup = db.SITE_DOCS.filter((d) => !d.required);
  const have = (d) => (st.docs[d.key] || []).length > 0;
  const docRow = (d) => {
    const files = st.docs[d.key] || [];
    const f = files.at(-1);
    return rowItem({
      lead: iconBubble(f ? I.file : d.required ? I.alert : I.file, f ? 'green' : d.required ? 'red' : 'slate'),
      title: esc(d.label),
      sub: f ? `${f.id ? `<a href="#" data-view="${f.id}">${esc(f.name)}</a>` : esc(f.name)} · ${dateShort(f.at)}${files.length > 1 ? ` · ${files.length} files` : ''}` : d.required ? '<span style="color:var(--red);font-weight:700">Missing</span>' : esc(d.note || 'Not uploaded'),
      trail: isStaff ? uploadIcon(`data-doc="${d.key}"`, `Upload ${d.label}`) : '',
    });
  };
  host.innerHTML = `
    <div class="twocol">
      <div>
        <section class="card" style="display:flex;gap:16px;align-items:center">
          ${ring(st.team.length ? (signed / st.team.length) * 100 : 0, 64, `${signed} of ${st.team.length} signed`)}
          <div style="flex:1;min-width:0"><p class="eyebrow" style="margin:0">RAMS rev ${esc(st.rams.rev)} · week ${week.split('-W')[1]}</p><h3 style="margin:2px 0 0">${signed} of ${st.team.length} operatives signed</h3></div>
          ${isStaff ? uploadBtn('id="ramsrev"', 'New rev') : ''}
        </section>
        <div class="group">${st.team.map((o) => {
          const sig = st.rams.signatures.find((x) => x.operative === o && x.week === week && x.rev === st.rams.rev);
          return rowItem({ lead: avatar(db.operative(o).name, 36), title: esc(db.operative(o).name), trail: sig ? `<span class="chip c-green">${I.check}${dateShort(sig.at)}</span>` : '<span class="chip c-red"><span class="dot"></span>Not signed</span>' });
        }).join('')}</div>
      </div>
      <div>
        <div class="group"><div class="gh">Required · ${req.filter(have).length} of ${req.length}</div>${req.map(docRow).join('')}</div>
        <details class="disc"><summary><span>Supporting documents</span><span class="muted small" style="margin-left:auto;font-weight:600">${sup.filter(have).length} of ${sup.length}</span></summary>${sup.map(docRow).join('')}</details>
      </div>
    </div>`;

  host.querySelector('#ramsrev')?.addEventListener('change', async (e) => {
    const f = await uploadTo(e.target);
    if (!f) return;
    st.rams.rev = st.docs.rams.length ? String.fromCharCode(st.rams.rev.charCodeAt(0) + 1) : st.rams.rev;
    st.docs.rams.push({ ...f, rev: st.rams.rev });
    db.persist(); toast(`RAMS rev ${st.rams.rev} issued. Operatives must re-sign.`); ctx.render();
  });
  host.querySelectorAll('[data-doc]').forEach((inp) => inp.addEventListener('change', async () => {
    const f = await uploadTo(inp);
    if (!f) return;
    (st.docs[inp.dataset.doc] ||= []).push(f);
    db.persist(); toast('Uploaded'); ctx.render();
  }));
  host.querySelectorAll('[data-view]').forEach((a) => a.addEventListener('click', async (e) => {
    e.preventDefault();
    const u = await fileURL(a.dataset.view);
    if (u) window.open(u, '_blank');
  }));
}

function jobTeam(ctx, st, host) {
  host.innerHTML = `
    <div class="twocol">
      <div>
        ${sectionHead('Installers on this job')}
        <p class="muted small" style="margin-top:-4px">Only ticked installers see this job on their phone.</p>
        <div class="group">${db.S().operatives.map((o) => rowItem({
          lead: avatar(o.name, 40), title: esc(o.name), sub: `${esc(o.role)} · ${gbp(o.rate)}/h`,
          trail: `<input type="checkbox" data-op="${o.id}" ${st.team.includes(o.id) ? 'checked' : ''} aria-label="Assign ${esc(o.name)}" style="width:26px;height:26px">`,
        })).join('')}</div>
        <p class="hint">Hourly rates are never shown to the client or to other operatives.</p>
      </div>
      <div>
        ${sectionHead('Client')}
        <div class="card"><div class="field" style="margin:0"><label for="cl">Shared with</label>
          <select id="cl"><option value="">Nobody</option>${db.S().clients.map((c) => `<option value="${c.id}" ${c.id === st.clientId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
          <p class="hint">The client sees progress, QA-passed hold points and documents in their portal.</p></div></div>
      </div>
    </div>`;
  host.querySelectorAll('[data-op]').forEach((cb) => cb.addEventListener('change', () => {
    if (cb.checked) st.team.push(cb.dataset.op); else st.team = st.team.filter((x) => x !== cb.dataset.op);
    db.persist(); toast(cb.checked ? 'Installer assigned' : 'Installer removed');
  }));
  host.querySelector('#cl').addEventListener('change', (e) => { st.clientId = e.target.value || null; db.persist(); toast('Client updated'); });
}

// ---------- QA ----------
export function viewQA(ctx) {
  const { main } = ctx;
  const q = db.S().pins.filter((p) => p.qa === 'pending').sort((a, b) => a.createdAt - b.createdAt);
  const bySite = {};
  q.forEach((p) => (bySite[p.siteId] ||= []).push(p));
  main.innerHTML = `
    <div class="pagehead"><div><p class="eyebrow">Quality check · by pin number</p><h1>QA queue</h1></div><span class="chip ${q.length ? 'c-red' : 'c-green'}">${q.length} waiting</span></div>
    <p class="muted">Pins stay red on the drawing until they pass QA, then turn green.</p>
    ${Object.entries(bySite).map(([sid, ps]) => `${sectionHead(`${esc(db.site(sid).name)} <span class="mono muted" style="font-size:15px">${ps.length}</span>`)}<div class="group">${ps.map((p) => pinRow(p)).join('')}</div>`).join('')
      || `<div class="group">${rowItem({ lead: iconBubble(I.check, 'green'), title: 'All clear', sub: 'Nothing waiting for QA' })}</div>`}`;
  setAction(main, null);
}

// ---------- Team & compliance ----------
export function viewCompany(ctx, params) {
  const { main } = ctx;
  const c = db.S().company;
  const t = params.get('t') || 'team';
  const rank = ['expired', 'soon', 'ok', 'none'];
  const worst = (o) => o.quals.map((q) => db.expiryState(q.expiry)).sort((a, b) => rank.indexOf(a) - rank.indexOf(b))[0];
  let body = '';
  if (t === 'team') {
    body = `<div class="group">${db.S().operatives.map((o) => rowItem({
      attrs: `data-op="${o.id}" role="button" tabindex="0" style="cursor:pointer"`,
      lead: avatar(o.name, 44), title: esc(o.name), sub: `${esc(o.role)} · ${gbp(o.rate)}/h · ${o.quals.length} qualifications`,
      trail: worst(o) === 'expired' ? `<span class="chip c-red">${I.alert}Expired</span>` : worst(o) === 'soon' ? `<span class="chip c-amber">${I.clock}Expiring</span>` : `<span class="chip c-green">${I.check}In date</span>`,
    })).join('')}</div>
    <button class="btn block" id="addop">${I.plus}Add operative</button>`;
  } else if (t === 'insurance') {
    body = `<div class="group">${db.INSURANCE.map((i) => {
      const v = c.insurance[i.key];
      return rowItem({ attrs: `data-ins="${i.key}" role="button" tabindex="0" style="cursor:pointer"`, lead: iconBubble(I.qa, v.expiry ? (db.expiryState(v.expiry) === 'ok' ? 'green' : 'orange') : 'slate'), title: esc(i.label), sub: `${gbpBig(v.value)} cover${v.file ? ` · ${esc(v.file.name)}` : ''}`, trail: v.expiry ? expiryChip(db.expiryState(v.expiry), v.expiry) : '<span class="chip c-slate">Not set</span>' });
    }).join('')}</div>`;
  } else if (t === 'accreditations') {
    body = `<div class="group">${c.accreditations.map((a) => rowItem({ lead: iconBubble(I.check, a.expiry && db.expiryState(a.expiry) !== 'ok' ? 'orange' : 'green'), title: esc(a.name), sub: `${a.expiry ? `Valid to ${dateShort(a.expiry)}` : 'No expiry'}${a.file ? ` · ${esc(a.file.name)}` : ''}`, trail: uploadBtn(`data-acc="${a.id}"`, a.file ? 'Replace' : 'Upload') })).join('')}</div>`;
  } else {
    body = `<p class="muted small">Material cost per linear metre by sock size, used for daily job costs. Quote sell rates live in the price book.</p>
      <div class="group">${Object.entries(db.SOCK_RATE).map(([mm, r]) => rowItem({ lead: iconBubble(I.sites, 'slate'), title: `<span class="mono">${mm}mm</span> sock`, trail: `£${r.toFixed(2)} / m` })).join('')}</div>
      ${sectionHead('Quote price book')}
      <div class="group">${db.CATALOGUE.map((x) => rowItem({ title: esc(x.desc), sub: `Cost £${x.cost.toFixed(2)} / ${x.unit}`, trail: `£${x.rate.toFixed(2)} / ${x.unit}` })).join('')}</div>`;
  }
  main.innerHTML = `
    <a class="btn sm ghost" href="#/more" style="margin:-8px 0 8px -12px">${I.back}More</a>
    <div class="pagehead"><div><p class="eyebrow">${esc(db.S().branding.name)}</p><h1>Team &amp; compliance</h1></div></div>
    <nav class="seg" aria-label="Sections">${[['team', 'Operatives'], ['insurance', 'Insurance'], ['accreditations', 'Accreditations'], ['rates', 'Rates']].map(([k, l]) => `<a href="#/company?t=${k}" ${k === t ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
    ${body}`;

  const onRow = (sel, fn) => main.querySelectorAll(sel).forEach((r) => { r.addEventListener('click', (e) => { if (!e.target.closest('label,input')) fn(r); }); r.addEventListener('keydown', (e) => { if (e.key === 'Enter') fn(r); }); });
  onRow('[data-op]', (r) => operativeSheet(ctx, db.operative(r.dataset.op)));
  main.querySelector('#addop')?.addEventListener('click', () => operativeSheet(ctx, null));
  onRow('[data-ins]', (r) => {
    const i = db.INSURANCE.find((x) => x.key === r.dataset.ins);
    const v = c.insurance[i.key];
    openSheet({
      title: i.label,
      body: `
        <div class="field"><label for="iv">Cover value</label><div class="unit" data-unit="£"><input id="iv" inputmode="numeric" value="${v.value || ''}"></div><p class="hint">Whole pounds, e.g. 10000000 for £10m</p></div>
        <div class="field"><label for="ie">Expiry date</label><input id="ie" type="date" value="${v.expiry}"></div>
        <div class="field"><span class="label">Certificate</span>${uploadBtn('id="icert"', v.file ? `Replace ${v.file.name}` : 'Upload certificate')}</div>`,
      primary: 'Save',
      onOpen: (sh) => sh.querySelector('#icert').addEventListener('change', async (e) => { const f = await uploadTo(e.target); if (f) { v.file = f; db.persist(); toast('Certificate uploaded'); } }),
      onPrimary: (sh) => { v.value = +sh.querySelector('#iv').value.replace(/\D/g, '') || 0; v.expiry = sh.querySelector('#ie').value; db.persist(); toast('Insurance updated'); ctx.render(); },
    });
  });
  main.querySelectorAll('[data-acc]').forEach((inp) => inp.addEventListener('change', async () => {
    const f = await uploadTo(inp); if (!f) return;
    c.accreditations.find((a) => a.id === inp.dataset.acc).file = f; db.persist(); toast('Certificate uploaded'); ctx.render();
  }));
  setAction(main, null);
}

function operativeSheet(ctx, o) {
  const isNew = !o;
  o ||= { id: uid(), name: '', role: 'Installer', rate: 22, email: '', quals: [] };
  openSheet({
    title: isNew ? 'Add operative' : o.name,
    body: `
      <div class="field"><label for="on">Name</label><input id="on" type="text" value="${esc(o.name)}" autocomplete="off"></div>
      <fieldset class="field"><legend>Role</legend><div class="choices c3">${db.ROLES.map((r) => `<label class="choice"><input type="radio" name="or" value="${r}" ${r === o.role ? 'checked' : ''}><span>${r}</span></label>`).join('')}</div></fieldset>
      <div class="field"><label for="rate">Hourly rate</label>${stepper('rate', o.rate, { step: 0.5, min: 0, max: 200, label: 'Hourly rate', unit: '£/h' })}<p class="hint">Hidden from clients and other operatives.</p></div>
      ${isNew ? '' : `<p class="label">Training and qualifications</p>
      <div class="group">${o.quals.map((q) => `<div class="ri" style="flex-wrap:wrap"><span class="ri-main" style="flex:1 1 180px"><span class="ri-title">${esc(q.name)}</span><span>${expiryChip(db.expiryState(q.expiry), q.expiry)}</span></span>
        <span class="row"><input type="date" value="${q.expiry}" data-qexp="${q.id}" aria-label="${esc(q.name)} expiry" style="width:auto;min-height:48px;font-size:16px">${uploadBtn(`data-qdoc="${q.id}"`, q.file ? 'Replace' : 'Upload')}</span></div>`).join('')}</div>`}`,
    primary: isNew ? 'Add operative' : 'Save',
    onOpen: (sh) => {
      wireSteppers(sh);
      sh.querySelectorAll('[data-qdoc]').forEach((inp) => inp.addEventListener('change', async () => {
        const f = await uploadTo(inp); if (!f) return;
        o.quals.find((q) => q.id === inp.dataset.qdoc).file = f; db.persist(); toast('Document uploaded');
      }));
    },
    onPrimary: (sh) => {
      const name = sh.querySelector('#on').value.trim();
      if (!name) { toast('Enter a name'); return false; }
      Object.assign(o, { name, role: sh.querySelector('[name=or]:checked').value, rate: +sh.querySelector('#rate').value || 0 });
      sh.querySelectorAll('[data-qexp]').forEach((inp) => { o.quals.find((q) => q.id === inp.dataset.qexp).expiry = inp.value; });
      if (isNew) {
        o.quals = ['Injecta Fire Barrier installer training', 'IPAF 3a/3b (MEWP)', 'CSCS card'].map((n) => ({ id: uid(), name: n, expiry: '', file: null }));
        db.S().operatives.push(o);
      }
      db.persist(); toast(isNew ? 'Operative added' : 'Saved'); ctx.render();
    },
  });
}

export { date };
