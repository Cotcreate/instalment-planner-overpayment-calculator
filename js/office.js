// Back office (and read-only client) screens: Dashboard, Sites, Site detail, QA queue, Company.
import * as db from './store.js';
import { mountElevation } from './elevation.js';
import { barChart } from './chart.js';
import { putFile, fileURL, downscale } from './files.js';
import {
  esc, uid, num, I, gbp, gbpBig, date, dateShort, time, toast, setAction, openSheet, qaChip, expiryChip,
  readJSON, writeJSON, stepper, wireSteppers,
} from './ui.js';
import { pinCard } from './installer.js';

const DAY = 86400000;
const isOffice = (ctx) => ctx.sess.role === 'office';

function weeklyLM(siteIds) {
  const out = [];
  const start = new Date(); start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  for (let i = 7; i >= 0; i--) {
    const from = start.getTime() - i * 7 * DAY;
    const lm = db.S().pins.filter((p) => siteIds.has(p.siteId) && p.createdAt >= from && p.createdAt < from + 7 * DAY).reduce((t, p) => t + p.length, 0);
    const d = new Date(from);
    out.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, detail: `w/c ${dateShort(from)}`, value: +lm.toFixed(1) });
  }
  return out;
}

async function uploadTo(input) {
  const f = input.files?.[0];
  if (!f) return null;
  const id = uid();
  await putFile(id, f.type.startsWith('image/') ? await downscale(f, 2400, 0.85).catch(() => f) : f);
  return { id, name: f.name, at: Date.now() };
}
const uploadBtn = (attrs, label = 'Upload', accept = 'application/pdf,image/*') =>
  `<label class="capture"><input type="file" accept="${accept}" ${attrs} aria-label="${esc(label)}"><span class="btn sm">${I.upload}${esc(label)}</span></label>`;

// ---------- Dashboard ----------
export function viewDashboard(ctx) {
  const { main } = ctx;
  const office = isOffice(ctx);
  const sites = db.S().sites.filter((s) => s.status === 'active');
  const stats = sites.map((s) => db.siteStats(s));
  const target = sites.reduce((t, s) => t + s.targetPins, 0);
  const approved = stats.reduce((t, s) => t + s.approved, 0);
  const pending = stats.reduce((t, s) => t + s.pending, 0);
  const rejected = stats.reduce((t, s) => t + s.rejected, 0);
  const lm = stats.reduce((t, s) => t + s.lm, 0);
  const alerts = office ? db.alerts() : [];
  const queue = db.S().pins.filter((p) => p.qa === 'pending').sort((a, b) => a.createdAt - b.createdAt);

  main.innerHTML = `
    <p class="eyebrow">${office ? esc(db.S().company.name) : 'Client view'} · ${sites.length} live sites</p>
    <div class="pagehead"><h1>Overview</h1></div>
    <section class="kpis" aria-label="Summary">
      <div class="kpi"><div class="v">${target ? Math.round((approved / target) * 100) : 0}<small>%</small></div><div class="k">QA passed</div></div>
      ${office ? `<a class="kpi cardlink ${pending ? 'alert' : ''}" href="#/qa"><div class="v">${pending}</div><div class="k">Awaiting QA →</div></a>` : `<div class="kpi"><div class="v">${approved}</div><div class="k">Hold points passed</div></div>`}
      <div class="kpi ${rejected ? 'alert' : ''}"><div class="v">${rejected}</div><div class="k">In rework</div></div>
      <div class="kpi"><div class="v">${num(lm, 0)}<small>m</small></div><div class="k">Injected to date</div></div>
    </section>
    <div class="split">
      <section class="card">
        <p class="eyebrow">Linear metres injected per week</p>
        <p class="muted small">Live sites, last 8 weeks. Tap a bar for detail.</p>
        <div id="chart"></div>
      </section>
      <div>
        ${office ? `
        <section class="card">
          <div class="spread"><p class="eyebrow" style="margin:0">Needs attention</p><span class="chip ${alerts.length ? 'c-red' : 'c-green'}">${alerts.length}</span></div>
          <ul class="list" style="margin-top:6px">${alerts.slice(0, 6).map((a) => `
            <li><a class="rowlink" href="${a.href}"><span style="display:flex;gap:10px;align-items:center;min-width:0"><span class="dot" style="color:${a.kind === 'soon' ? 'var(--orange)' : 'var(--red)'}"></span><span style="min-width:0">${esc(a.text)}${a.when ? ` <span class="muted small">· ${a.kind === 'expired' ? 'expired' : 'expires'} ${dateShort(a.when)}</span>` : ''}</span></span>${I.chev.replace('<svg', '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" style="flex:none"')}</a></li>`).join('') || '<li>All clear.</li>'}
          </ul>
        </section>
        <section class="card">
          <div class="spread"><p class="eyebrow" style="margin:0">QA queue</p><a class="btn sm ghost" href="#/qa">See all</a></div>
          <div class="stack" style="margin-top:8px">${queue.slice(0, 3).map((p) => pinCard(p)).join('') || '<p class="muted">Nothing waiting.</p>'}</div>
        </section>` : sitesTable(ctx, sites)}
      </div>
    </div>`;

  ctx.cleanups.push(barChart(main.querySelector('#chart'), { data: weeklyLM(new Set(sites.map((s) => s.id))), unit: 'm', label: 'Linear metres injected per week' }).destroy);
  setAction(main, null);
}

// ---------- Sites ----------
const DEFAULT_F = { status: ['active'], client: 'all', issues: false };

function sitesTable(ctx, list) {
  const office = isOffice(ctx);
  if (!list.length) return '<p class="empty card">No sites match these filters.</p>';
  return `
    <table class="rtable">
      <thead><tr><th>Site</th><th>QA passed</th><th>${office ? 'Awaiting QA' : 'Injected'}</th><th>Fire rating</th><th>Rework</th><th><span class="sr">Open</span></th></tr></thead>
      <tbody>${list.map((st) => {
        const s = db.siteStats(st);
        return `
        <tr>
          <td class="name"><a class="title" href="#/sites/${st.id}">${esc(st.name)}</a><div class="muted small">${esc(st.client)} · ${st.status === 'active' ? 'Live' : 'Complete'}</div></td>
          <td class="key" data-label="QA passed"><div class="num">${s.pct}<small>%</small></div><div class="progress"><i style="width:${s.pct}%"></i></div><div class="muted small" style="margin-top:4px">${s.approved} of ${st.targetPins}</div></td>
          ${office
            ? `<td class="key" data-label="Awaiting QA"><div class="num" style="${s.pending ? 'color:var(--red)' : ''}">${s.pending}</div><div class="muted small">hold points</div></td>`
            : `<td class="key" data-label="Injected"><div class="num">${num(s.lm, 0)}<small>m</small></div></td>`}
          <td data-label="Fire rating"><span class="mono">${st.fireRating} min</span></td>
          <td data-label="Rework">${s.rejected}${office && (s.missingDocs.length || s.unsigned.length) ? ` · <span style="color:var(--red);font-weight:700">${s.missingDocs.length + s.unsigned.length} issue${s.missingDocs.length + s.unsigned.length > 1 ? 's' : ''}</span>` : ''}</td>
          <td class="go"><a class="btn sm block" href="#/sites/${st.id}">Open site</a></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
}

export function viewSites(ctx) {
  const { main } = ctx;
  const f = { ...DEFAULT_F, ...readJSON('injectatrace.siteFilters', {}) };
  const list = db.S().sites.filter((st) => f.status.includes(st.status) && (f.client === 'all' || st.client === f.client)
    && (!f.issues || (() => { const s = db.siteStats(st); return s.rejected || s.missingDocs.length || s.unsigned.length; })()));
  const n = (f.status.join() !== DEFAULT_F.status.join() ? 1 : 0) + (f.client !== 'all' ? 1 : 0) + (f.issues ? 1 : 0);

  main.innerHTML = `
    <p class="eyebrow">${list.length} site${list.length === 1 ? '' : 's'}</p>
    <div class="pagehead"><h1>Sites</h1><button type="button" class="btn sm" id="filters" aria-haspopup="dialog">${I.filter}Filter${n ? ` (${n})` : ''}</button></div>
    ${sitesTable(ctx, list)}`;

  main.querySelector('#filters').addEventListener('click', () => {
    const clients = [...new Set(db.S().sites.map((s) => s.client))];
    openSheet({
      title: 'Filter sites',
      body: `
        <fieldset class="field"><legend>Status</legend>
          <div class="choices c2">${[['active', 'Live'], ['complete', 'Complete']].map(([k, l]) => `<label class="choice"><input type="checkbox" name="st" value="${k}" ${f.status.includes(k) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></fieldset>
        <div class="field"><label for="fc">Client</label><select id="fc"><option value="all">All clients</option>${clients.map((c) => `<option ${c === f.client ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <label class="toggle"><span>Only sites with issues</span><input type="checkbox" id="fi" ${f.issues ? 'checked' : ''}></label>`,
      primary: 'Show sites', secondary: 'Reset',
      onPrimary: (sh) => {
        writeJSON('injectatrace.siteFilters', { status: [...sh.querySelectorAll('[name=st]:checked')].map((x) => x.value), client: sh.querySelector('#fc').value, issues: sh.querySelector('#fi').checked });
        viewSites(ctx);
      },
      onSecondary: (sh) => {
        sh.querySelectorAll('[name=st]').forEach((x) => { x.checked = DEFAULT_F.status.includes(x.value); });
        sh.querySelector('#fc').value = 'all';
        sh.querySelector('#fi').checked = false;
      },
    });
  });
  setAction(main, null);
}

// ---------- Site detail ----------
export async function viewSite(ctx, id, tab = 'overview', params) {
  const { main } = ctx;
  const office = isOffice(ctx);
  const st = db.site(id);
  if (!st) { main.innerHTML = '<p class="empty card">Site not found.</p>'; setAction(main, null); return; }
  const s = db.siteStats(st);
  const tabs = [['overview', 'Overview'], ['pins', 'Hold points', s.pending], ['daily', 'Daily'], ['docs', 'Documents', office ? s.missingDocs.length + s.unsigned.length : 0], ...(office ? [['team', 'Team']] : [])];
  if (!tabs.find((t) => t[0] === tab)) tab = 'overview';

  main.innerHTML = `
    <a class="btn sm ghost" href="#/sites" style="margin:-8px 0 8px -12px">${I.back}Sites</a>
    <p class="eyebrow">${esc(st.client)} · FR ${st.fireRating} min</p>
    <h1>${esc(st.name)}</h1>
    <p class="muted" style="margin-top:-4px">${esc(st.address)}</p>
    <nav class="tabs" aria-label="Site sections">${tabs.map(([k, l, c]) => `<a href="#/sites/${st.id}/${k}" ${k === tab ? 'aria-current="page"' : ''}>${l}${c ? ` <span class="count">${c}</span>` : ''}</a>`).join('')}</nav>
    <div id="tab"></div>`;
  const host = main.querySelector('#tab');
  setAction(main, null);

  if (tab === 'overview') await siteOverview(ctx, st, s, host);
  if (tab === 'pins') sitePins(ctx, st, host, params);
  if (tab === 'daily') siteDaily(ctx, st, host);
  if (tab === 'docs') siteDocs(ctx, st, host);
  if (tab === 'team') siteTeam(ctx, st, host);
}

async function siteOverview(ctx, st, s, host) {
  const office = isOffice(ctx);
  const key = `injectatrace.elev.${st.id}`;
  let el = db.elevation(st, readJSON(key, st.elevations[0].id)) || st.elevations[0];
  const pins = db.pinsFor(st.id).filter((p) => p.elevationId === el.id);
  host.innerHTML = `
    <section class="kpis">
      <div class="kpi"><div class="v">${s.pct}<small>%</small></div><div class="k">QA passed · ${s.approved}/${st.targetPins}</div></div>
      <div class="kpi ${s.pending ? 'alert' : ''}"><div class="v">${s.pending}</div><div class="k">Awaiting QA</div></div>
      <div class="kpi"><div class="v">${num(s.lm, 0)}<small>m</small></div><div class="k">Injected</div></div>
      ${office ? `<div class="kpi"><div class="v">${s.pails}</div><div class="k">Pails used</div></div>` : `<div class="kpi ${s.rejected ? 'alert' : ''}"><div class="v">${s.rejected}</div><div class="k">In rework</div></div>`}
    </section>
    <div class="split">
      <div>
        <fieldset class="field" style="margin-bottom:12px"><legend class="sr">Elevation</legend>
          <div class="choices">${st.elevations.map((e) => `<label class="choice"><input type="radio" name="el" value="${e.id}" ${e.id === el.id ? 'checked' : ''}><span>${esc(e.name)}</span></label>`).join('')}</div></fieldset>
        <div id="elev"></div>
        <div class="legend"><span><span class="dot" style="color:var(--red)"></span>Awaiting QA / rework</span><span><span class="dot" style="color:var(--green)"></span>QA passed</span></div>
        ${office ? `<div class="row" style="margin-top:12px">${uploadBtn('id="draw"', el.image ? 'Replace drawing' : 'Upload marked-up drawing', 'image/*')}</div>` : ''}
      </div>
      <div>
        <div id="picked" aria-live="polite"></div>
        ${office ? `
        <div class="card">
          <div class="field" style="margin:0"><label for="fr">Fire rating</label>
            <select id="fr">${db.FIRE_RATINGS.map((r) => `<option value="${r}" ${r === st.fireRating ? 'selected' : ''}>${r} minutes</option>`).join('')}</select></div>
        </div>` : ''}
        <div class="card"><p class="eyebrow">${esc(el.name)} elevation</p>
          <ul class="list">
            <li><span class="k">Hold points</span><span class="v">${pins.length}</span></li>
            <li><span class="k">QA passed</span><span class="v" style="color:var(--green)">${pins.filter((p) => p.qa === 'approved').length}</span></li>
            <li><span class="k">Red pins</span><span class="v" style="color:var(--red)">${pins.filter((p) => p.qa !== 'approved').length}</span></li>
          </ul></div>
      </div>
    </div>`;

  host.querySelectorAll('[name=el]').forEach((r) => r.addEventListener('change', () => { writeJSON(key, r.value); ctx.render(); }));
  host.querySelector('#fr')?.addEventListener('change', (e) => { st.fireRating = +e.target.value; db.persist(); toast(`Fire rating set to ${st.fireRating} min`); });
  host.querySelector('#draw')?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const blob = await downscale(f, 2400, 0.85).catch(() => f);
    const bmp = await createImageBitmap(blob);
    const id = uid();
    await putFile(id, blob);
    el.image = { id, w: bmp.width, h: bmp.height };
    (st.docs.elevations ||= []).push({ id, name: f.name, at: Date.now() });
    db.persist();
    toast('Drawing uploaded');
    ctx.render();
  });

  const image = el.image ? await fileURL(el.image.id).then((u) => (u ? { url: u, w: el.image.w, h: el.image.h } : null)) : null;
  const m = mountElevation(host.querySelector('#elev'), {
    el, pins, image,
    onSelect: (pid) => {
      const p = pins.find((x) => x.id === pid);
      host.querySelector('#picked').innerHTML = p ? pinCard(p, { showSite: false }) : '';
    },
  });
  ctx.cleanups.push(m.destroy);
}

function sitePins(ctx, st, host, params) {
  const f = params?.get('f') || 'all';
  const all = db.pinsFor(st.id).sort((a, b) => b.createdAt - a.createdAt);
  const counts = { all: all.length, pending: 0, rejected: 0, approved: 0 };
  all.forEach((p) => counts[p.qa]++);
  const list = all.filter((p) => f === 'all' || p.qa === f);
  const tabs = [['all', 'All'], ['pending', 'Awaiting QA'], ['rejected', 'Rework'], ['approved', 'Passed']];
  host.innerHTML = `
    <div class="row" style="margin-bottom:14px">${tabs.map(([k, l]) => `<a class="btn sm ${k === f ? 'primary' : ''}" href="#/sites/${st.id}/pins?f=${k}">${l} <span class="mono">${counts[k]}</span></a>`).join('')}</div>
    <div class="stack grid2">${list.slice(0, 60).map((p) => pinCard(p, { showSite: false })).join('') || '<p class="empty card">None.</p>'}</div>`;
}

function siteDaily(ctx, st, host) {
  const office = isOffice(ctx);
  const days = db.S().days.filter((d) => d.siteId === st.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const week = db.isoWeek();
  const weekDays = db.S().days.filter((d) => d.siteId === st.id && db.isoWeek(new Date(d.date)) === week);
  const hours = {};
  weekDays.forEach((d) => Object.entries(d.hours || {}).forEach(([o, h]) => { hours[o] = (hours[o] || 0) + h; }));
  const temps = (r) => (r ? db.TEMPS.map((t) => `<span><span class="muted small">${t.label}</span><br><strong>${r[t.key] ?? '—'}°</strong></span>`).join('') : '<span class="muted" style="grid-column:1/-1">Not recorded</span>');

  host.innerHTML = `
    <div class="split">
      <div class="stack">${days.map((d) => {
        const c = db.dayCost(d);
        const hrs = Object.values(d.hours || {}).reduce((a, b) => a + b, 0);
        return `
        <article class="card">
          <div class="spread"><h3 style="margin:0">${new Date(d.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</h3>
            <span class="row" style="gap:6px">${d.incident ? `<span class="chip c-red">${I.alert}Incident</span>` : ''}${d.am && d.pm ? `<span class="chip c-green">${I.check}AM + PM</span>` : '<span class="chip c-red"><span class="dot"></span>Temps missing</span>'}</span></div>
          ${['am', 'pm'].map((w) => `<p class="eyebrow" style="margin:14px 0 6px">${w.toUpperCase()}${d[w] ? ` · ${time(d[w].at)} · GPS ${d[w].gps ? '✓' : '—'}` : ''}</p><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">${temps(d[w])}</div>`).join('')}
          <ul class="list" style="margin-top:10px">
            <li><span class="k">Hours</span><span class="v">${hrs} h</span></li>
            ${d.toolbox ? `<li><span class="k">Toolbox talk</span><span class="v">${esc(d.toolbox)}</span></li>` : ''}
            <li><span class="k">H&amp;S checks</span><span class="v">${(d.checks || []).filter(Boolean).length}/${db.HS_CHECKS.length}</span></li>
            <li><span class="k">Video diary</span><span class="v">${d.diary ? 'Recorded' : '—'}</span></li>
            ${office ? `<li><span class="k">Cost (labour + materials)</span><span class="v">${gbp(c.total)} <span class="muted small">(${gbp(c.labour)} + ${gbp(c.materials)})</span></span></li>` : ''}
          </ul>
          ${d.incident ? `<p class="small" style="margin:8px 0 0;padding:8px 10px;border-radius:10px;background:var(--red-bg);color:var(--red);font-weight:600">${esc(d.incident)}</p>` : ''}
        </article>`;
      }).join('') || '<p class="empty card">No daily records yet.</p>'}</div>
      <section class="card">
        <p class="eyebrow">Hours this week · W${week.split('-W')[1]}</p>
        <ul class="list">${st.team.map((o) => `<li><span class="k">${esc(db.operative(o).name)}</span><span class="v">${hours[o] || 0} h${office ? ` <span class="muted small">· ${gbp((hours[o] || 0) * db.operative(o).rate)}</span>` : ''}</span></li>`).join('')}</ul>
      </section>
    </div>`;
}

function siteDocs(ctx, st, host) {
  const office = isOffice(ctx);
  const week = db.isoWeek();
  host.innerHTML = `
    <section class="card">
      <div class="spread top"><div><p class="eyebrow">RAMS · Week ${week.split('-W')[1]}</p><h3 style="margin:0">Current revision <span class="mono">${esc(st.rams.rev)}</span></h3></div>
        ${office ? uploadBtn('id="ramsrev"', 'New revision') : ''}</div>
      <ul class="list" style="margin-top:10px">${st.team.map((o) => {
        const sig = st.rams.signatures.find((x) => x.operative === o && x.week === week && x.rev === st.rams.rev);
        return `<li><span class="k">${esc(db.operative(o).name)}</span><span class="v">${sig ? `<span class="chip c-green">${I.check}Signed ${dateShort(sig.at)}</span>` : '<span class="chip c-red"><span class="dot"></span>Not signed</span>'}</span></li>`;
      }).join('')}</ul>
      <p class="hint">Operatives sign each week, and again whenever a new revision is uploaded.</p>
    </section>
    <section class="card">
      <p class="eyebrow">Site documents</p>
      <ul class="list">${db.SITE_DOCS.filter((d) => d.key !== 'rams').map((d) => {
        const files = st.docs[d.key] || [];
        const lastF = files.at(-1);
        return `<li>
          <span class="k" style="flex:1;min-width:0"><strong>${esc(d.label)}</strong>${d.required ? ' <span class="chip c-navy" style="font-size:12px;padding:2px 8px">Required</span>' : ''}
            <br><span class="small ${lastF ? 'muted' : ''}" style="${!lastF && d.required ? 'color:var(--red);font-weight:700' : ''}">${lastF ? `${files.length > 1 ? `${files.length} files · ` : ''}${lastF.id ? `<a href="#" data-view="${lastF.id}">${esc(lastF.name)}</a>` : esc(lastF.name)} · ${dateShort(lastF.at)}` : d.required ? 'Missing' : esc(d.note || 'Not uploaded')}</span></span>
          ${office ? uploadBtn(`data-doc="${d.key}"`, lastF ? 'Add' : 'Upload') : ''}
        </li>`;
      }).join('')}</ul>
    </section>`;

  host.querySelector('#ramsrev')?.addEventListener('change', async (e) => {
    const f = await uploadTo(e.target);
    if (!f) return;
    st.rams.rev = String.fromCharCode(st.rams.rev.charCodeAt(0) + 1);
    st.docs.rams.push({ ...f, rev: st.rams.rev });
    db.persist();
    toast(`RAMS rev ${st.rams.rev} issued. Operatives must re-sign.`);
    ctx.render();
  });
  host.querySelectorAll('[data-doc]').forEach((inp) => inp.addEventListener('change', async () => {
    const f = await uploadTo(inp);
    if (!f) return;
    (st.docs[inp.dataset.doc] ||= []).push(f);
    db.persist();
    toast('Uploaded');
    ctx.render();
  }));
  host.querySelectorAll('[data-view]').forEach((a) => a.addEventListener('click', async (e) => {
    e.preventDefault();
    const u = await fileURL(a.dataset.view);
    if (u) window.open(u, '_blank');
  }));
}

function siteTeam(ctx, st, host) {
  const others = db.S().operatives.filter((o) => !st.team.includes(o.id));
  host.innerHTML = `
    <section class="card">
      <p class="eyebrow">Assigned operatives</p>
      <ul class="list">${st.team.map((oid) => { const o = db.operative(oid); return `
        <li><span class="k"><strong>${esc(o.name)}</strong><br><span class="muted small">${esc(o.role)} · ${gbp(o.rate)}/h</span></span>
          <button class="btn sm danger" data-rm="${o.id}" aria-label="Remove ${esc(o.name)}">Remove</button></li>`; }).join('')}</ul>
      ${others.length ? `<div class="field" style="margin:14px 0 0"><label for="add">Add operative</label>
        <div class="row" style="flex-wrap:nowrap"><select id="add">${others.map((o) => `<option value="${o.id}">${esc(o.name)} · ${esc(o.role)} · ${gbp(o.rate)}/h</option>`).join('')}</select>
        <button class="btn primary" id="addbtn" style="flex:none">Add</button></div></div>` : ''}
      <p class="hint">Hourly rates are never shown to the client or to other operatives.</p>
    </section>`;
  host.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { st.team = st.team.filter((x) => x !== b.dataset.rm); db.persist(); ctx.render(); }));
  host.querySelector('#addbtn')?.addEventListener('click', () => { st.team.push(host.querySelector('#add').value); db.persist(); toast('Operative added'); ctx.render(); });
}

// ---------- QA queue ----------
export function viewQA(ctx) {
  const { main } = ctx;
  const q = db.S().pins.filter((p) => p.qa === 'pending').sort((a, b) => a.createdAt - b.createdAt);
  const bySite = {};
  q.forEach((p) => (bySite[p.siteId] ||= []).push(p));
  main.innerHTML = `
    <p class="eyebrow">Quality check · by pin number</p>
    <div class="pagehead"><h1>QA queue</h1><span class="chip ${q.length ? 'c-red' : 'c-green'}">${q.length} waiting</span></div>
    <p class="muted">Pins stay red on the drawing until they pass QA, then turn green.</p>
    ${Object.entries(bySite).map(([sid, ps]) => `
      <h2 style="margin-top:20px">${esc(db.site(sid).name)} <span class="mono muted" style="font-size:16px">${ps.length}</span></h2>
      <div class="stack grid2">${ps.map((p) => pinCard(p, { showSite: false })).join('')}</div>`).join('') || '<div class="card empty"><h3>All clear</h3><p>Nothing waiting for QA.</p></div>'}`;
  setAction(main, null);
}

// ---------- Company ----------
export function viewCompany(ctx) {
  const { main } = ctx;
  const c = db.S().company;
  main.innerHTML = `
    <p class="eyebrow">By company</p>
    <div class="pagehead"><h1>${esc(c.name)}</h1></div>
    <div class="spread" style="margin:8px 0 10px"><h2 style="margin:0">Operatives</h2><button class="btn sm primary" id="addop">${I.plus}Add</button></div>
    <div class="stack grid2">${db.S().operatives.map((o) => {
      const worst = o.quals.map((q) => db.expiryState(q.expiry)).sort((a, b) => ['expired', 'soon', 'ok', 'none'].indexOf(a) - ['expired', 'soon', 'ok', 'none'].indexOf(b))[0];
      return `
      <button type="button" class="card cardlink" data-op="${o.id}" style="width:100%;text-align:left;font:inherit;color:inherit;cursor:pointer;margin:0">
        <div class="spread top"><div><h3 style="margin:0">${esc(o.name)}</h3><div class="muted small">${esc(o.role)} · ${gbp(o.rate)}/h · ${o.quals.length} qualifications</div></div>
          ${worst === 'expired' ? `<span class="chip c-red">${I.alert}Expired</span>` : worst === 'soon' ? `<span class="chip c-amber">${I.clock}Expiring</span>` : `<span class="chip c-green">${I.check}In date</span>`}</div>
      </button>`;
    }).join('')}</div>

    <h2 style="margin:28px 0 10px">Insurance</h2>
    <div class="stack grid2">${db.INSURANCE.map((i) => {
      const v = c.insurance[i.key];
      return `
      <section class="card">
        <div class="spread top"><h3 style="margin:0">${esc(i.label)}</h3>${v.expiry ? expiryChip(db.expiryState(v.expiry), v.expiry) : '<span class="chip c-slate">Not set</span>'}</div>
        <p class="big" style="margin:10px 0">${gbpBig(v.value)}</p>
        <div class="row">
          <button class="btn sm" data-ins="${i.key}">Edit cover</button>
          ${uploadBtn(`data-insdoc="${i.key}"`, v.file ? 'Replace certificate' : 'Upload certificate')}
        </div>
        ${v.file ? `<p class="small muted" style="margin:8px 0 0">${esc(v.file.name)}</p>` : ''}
      </section>`;
    }).join('')}</div>

    <h2 style="margin:28px 0 10px">Accreditations</h2>
    <section class="card"><ul class="list">${c.accreditations.map((a) => `
      <li><span class="k" style="flex:1;min-width:0"><strong>${esc(a.name)}</strong><br>${a.expiry ? expiryChip(db.expiryState(a.expiry), a.expiry) : '<span class="muted small">No expiry</span>'}${a.file ? ` <span class="muted small">· ${esc(a.file.name)}</span>` : ''}</span>
        ${uploadBtn(`data-acc="${a.id}"`, a.file ? 'Replace' : 'Upload')}</li>`).join('')}</ul></section>

    <h2 style="margin:28px 0 10px">Material rates</h2>
    <section class="card">
      <p class="muted small">Used for daily costs: sock diameter × linear metres injected. Placeholder figures.</p>
      <ul class="list">${Object.entries(db.SOCK_RATE).map(([mm, r]) => `<li><span class="k mono">${mm}mm sock</span><span class="v">£${r.toFixed(2)} / m</span></li>`).join('')}</ul>
    </section>`;

  main.querySelectorAll('[data-op]').forEach((b) => b.addEventListener('click', () => operativeSheet(ctx, db.operative(b.dataset.op))));
  main.querySelector('#addop').addEventListener('click', () => operativeSheet(ctx, null));
  main.querySelectorAll('[data-ins]').forEach((b) => b.addEventListener('click', () => {
    const i = db.INSURANCE.find((x) => x.key === b.dataset.ins);
    const v = c.insurance[i.key];
    openSheet({
      title: i.label,
      body: `
        <div class="field"><label for="iv">Cover value</label><div class="unit" data-unit="£"><input id="iv" inputmode="numeric" value="${v.value || ''}"></div><p class="hint">Whole pounds, e.g. 10000000 for £10m</p></div>
        <div class="field"><label for="ie">Expiry date</label><input id="ie" type="date" value="${v.expiry}"></div>`,
      primary: 'Save',
      onPrimary: (sh) => { v.value = +sh.querySelector('#iv').value.replace(/\D/g, '') || 0; v.expiry = sh.querySelector('#ie').value; db.persist(); toast('Insurance updated'); ctx.render(); },
    });
  }));
  main.querySelectorAll('[data-insdoc]').forEach((inp) => inp.addEventListener('change', async () => {
    const f = await uploadTo(inp); if (!f) return;
    c.insurance[inp.dataset.insdoc].file = f; db.persist(); toast('Certificate uploaded'); ctx.render();
  }));
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
      <ul class="list">${o.quals.map((q) => `<li style="flex-wrap:wrap"><span class="k" style="flex:1 1 180px"><strong>${esc(q.name)}</strong><br>${expiryChip(db.expiryState(q.expiry), q.expiry)}${q.file ? ` <span class="muted small">· ${esc(q.file.name)}</span>` : ''}</span>
        <span class="row"><input type="date" value="${q.expiry}" data-qexp="${q.id}" aria-label="${esc(q.name)} expiry" style="width:auto;min-height:48px;font-size:16px">${uploadBtn(`data-qdoc="${q.id}"`, q.file ? 'Replace' : 'Upload')}</span></li>`).join('')}</ul>`}`,
    primary: isNew ? 'Add operative' : 'Save',
    onOpen: (sh) => {
      wireSteppers(sh);
      sh.querySelectorAll('[data-qdoc]').forEach((inp) => inp.addEventListener('change', async () => {
        const f = await uploadTo(inp); if (!f) return;
        o.quals.find((q) => q.id === inp.dataset.qdoc).file = f; db.persist(); toast('Document uploaded');
        inp.nextElementSibling.lastChild.textContent = 'Replace';
      }));
    },
    onPrimary: (sh) => {
      const name = sh.querySelector('#on').value.trim();
      if (!name) { toast('Enter a name'); return false; }
      Object.assign(o, { name, role: sh.querySelector('[name=or]:checked').value, rate: +sh.querySelector('#rate').value || 0 });
      sh.querySelectorAll('[data-qexp]').forEach((inp) => { o.quals.find((q) => q.id === inp.dataset.qexp).expiry = inp.value; });
      if (isNew) {
        o.quals = [{ id: uid(), name: 'Injecta Fire Barrier installer training', expiry: '', file: null }, { id: uid(), name: 'IPAF 3a/3b (MEWP)', expiry: '', file: null }, { id: uid(), name: 'CSCS card', expiry: '', file: null }];
        db.S().operatives.push(o);
      }
      db.persist();
      toast(isNew ? 'Operative added' : 'Saved');
      ctx.render();
    },
  });
}
