// Quoting: pipeline, builder, branded quote document, client acceptance, convert to job.
import * as db from './store.js';
import { putFile, fileURL, deleteFile } from './files.js';
import {
  esc, uid, I, toast, setAction, openSheet, trail, stepper, wireSteppers, readJSON, writeJSON,
  avatar, rowItem, spec, money, moneyK, fileSize, sectionHead, dateShort, date, ago, wordmark,
} from './ui.js';

const DAY = 86400000;
const STEPS = ['Client & job', 'Scope', 'Files', 'Review'];
const staff = (sess) => sess.role === 'manager' || sess.role === 'office';
export const quoteChip = (q) => { const s = db.QUOTE_STATUS[q.status]; return `<span class="chip ${s.chip}">${s.label}</span>`; };

// ---------- Pipeline ----------
export function viewQuotes(ctx, params) {
  const { main, sess } = ctx;
  db.sweepQuotes();
  const isStaff = staff(sess);
  const all = db.quotesFor(sess).slice().sort((a, b) => b.createdAt - a.createdAt);
  const f = params.get('f') || (isStaff ? 'open' : 'all');
  const filt = readJSON('injectatrace.quoteFilters', { client: 'all', owner: 'all' });
  const groups = {
    open: (q) => q.status === 'draft' || q.status === 'sent',
    won: (q) => q.status === 'accepted',
    lost: (q) => q.status === 'declined' || q.status === 'expired',
    all: () => true,
  };
  const scoped = all.filter((q) => (filt.client === 'all' || q.clientId === filt.client) && (filt.owner === 'all' || q.owner === filt.owner));
  const list = scoped.filter(groups[f]);
  const sent = all.filter((q) => q.status === 'sent');
  const yearAgo = Date.now() - 365 * DAY;
  const decided = all.filter((q) => ['accepted', 'declined', 'expired'].includes(q.status) && q.decidedAt > yearAgo);
  const won = decided.filter((q) => q.status === 'accepted');
  const winRate = decided.length ? Math.round((won.length / decided.length) * 100) : 0;
  const nFilt = (filt.client !== 'all') + (filt.owner !== 'all');

  main.innerHTML = `
    <div class="pagehead">
      <div><p class="eyebrow">${isStaff ? 'Pipeline' : esc(db.client(sess.clientId)?.name)}</p><h1>Quotes</h1></div>
      ${isStaff ? `<a class="btn primary sm" href="#/quotes/new">${I.plus}New quote</a>` : ''}
    </div>
    ${isStaff ? `
    <section class="hero">
      <p class="eyebrow">Open pipeline</p>
      <div class="big">${moneyK(sent.reduce((t, q) => t + db.quoteTotals(q).net, 0))}</div>
      <p class="sub" style="margin:4px 0 0">${sent.length} quote${sent.length === 1 ? '' : 's'} awaiting a decision · ex VAT</p>
      <div class="hero-stats" style="margin-bottom:0">
        <div><b>${moneyK(won.reduce((t, q) => t + db.quoteTotals(q).net, 0))}</b><span>Won 12m</span></div>
        <div><b>${winRate}%</b><span>Win rate</span></div>
        <div><b>${all.filter((q) => q.status === 'draft').length}</b><span>Drafts</span></div>
      </div>
    </section>` : ''}
    <div class="spread" style="gap:10px;align-items:flex-start">
      <nav class="seg" aria-label="Filter quotes" style="flex:1">
        ${[['open', isStaff ? 'Open' : 'To review'], ['won', 'Won'], ['lost', 'Lost'], ['all', 'All']].map(([k, l]) => `<a href="#/quotes?f=${k}" ${k === f ? 'aria-current="page"' : ''}>${l} <span class="n">${scoped.filter(groups[k]).length}</span></a>`).join('')}
      </nav>
      ${isStaff ? `<button type="button" class="btn iconbtn" id="qfilter" aria-label="Filter by client or owner" style="margin-top:2px;background:${nFilt ? 'var(--navy)' : 'var(--white)'};color:${nFilt ? '#fff' : 'var(--navy)'}">${I.filter}</button>` : ''}
    </div>
    <div class="group">${list.slice(0, 80).map((q) => quoteRow(q)).join('') || `<div class="empty">${f === 'open' && isStaff ? 'No open quotes. Start one with New quote.' : 'Nothing here.'}</div>`}</div>`;

  main.querySelector('#qfilter')?.addEventListener('click', () => openSheet({
    title: 'Filter quotes',
    body: `
      <div class="field"><label for="fcl">Client</label><select id="fcl"><option value="all">All clients</option>${db.S().clients.map((c) => `<option value="${c.id}" ${c.id === filt.client ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="fow">Prepared by</label><select id="fow"><option value="all">Anyone</option>${db.S().managers.map((m) => `<option ${m.name === filt.owner ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>`,
    primary: 'Show quotes', secondary: 'Reset',
    onPrimary: (sh) => { writeJSON('injectatrace.quoteFilters', { client: sh.querySelector('#fcl').value, owner: sh.querySelector('#fow').value }); ctx.render(); },
    onSecondary: (sh) => { sh.querySelector('#fcl').value = 'all'; sh.querySelector('#fow').value = 'all'; },
  }));
  setAction(main, null);
}

export function quoteRow(q) {
  const c = db.client(q.clientId);
  const t = db.quoteTotals(q);
  const exp = db.quoteExpiry(q);
  const soon = q.status === 'sent' && exp - Date.now() < 7 * DAY;
  return rowItem({
    href: `#/quotes/${q.id}`,
    lead: avatar(c?.name, 40),
    title: esc(q.title),
    sub: `<span class="mono">${esc(q.ref)}</span> · ${esc(c?.name)}${soon ? ` · <span style="color:var(--orange-deep);font-weight:700">expires ${dateShort(exp)}</span>` : ` · ${ago(q.createdAt)}`}`,
    trail: `<span>${moneyK(t.net)}</span>${quoteChip(q)}`,
  });
}

// ---------- Quote document ----------
export function quoteDoc(q, { internal = false } = {}) {
  const b = db.S().branding;
  const c = db.client(q.clientId);
  const contact = c?.contacts.find((x) => x.name === q.contact) || c?.contacts[0];
  const t = db.quoteTotals(q);
  return `
    <article class="doc" aria-label="Quote ${esc(q.ref)}">
      <header class="doc-head">
        <img src="${b.logo}" alt="${esc(b.name)}">
        <div class="ttl"><b>QUOTATION</b><span class="mono">${esc(q.ref)}</span></div>
      </header>
      <div class="doc-meta">
        <div><p class="eyebrow">Prepared for</p><p><strong>${esc(c?.name || 'Client')}</strong><br>${esc(contact?.name || '')}<br><span class="muted small">${esc(contact?.email || '')}</span></p></div>
        <div><p class="eyebrow">Project</p><p><strong>${esc(q.title || 'Untitled job')}</strong><br>${esc(q.address || '')}<br><span class="muted small">Fire rating ${q.fireRating} min · Injecta Fire Barrier</span></p></div>
        <div><p class="eyebrow">Date</p><p>${date(q.sentAt || q.createdAt)}</p></div>
        <div><p class="eyebrow">Valid until</p><p>${date(db.quoteExpiry(q))}</p></div>
      </div>
      <table>
        <thead><tr><th>Description</th><th class="num">Qty</th><th class="num hide-sm">Rate</th><th class="num">Amount</th></tr></thead>
        <tbody>${q.lines.map((l) => `<tr><td>${esc(l.desc)}</td><td class="num">${+l.qty.toFixed(2)} ${esc(l.unit)}</td><td class="num hide-sm">${money(l.rate, 2)}</td><td class="num">${money(l.qty * l.rate, 2)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No lines yet</td></tr>'}</tbody>
      </table>
      <div class="doc-tot">
        <div><span>Subtotal</span><span>${money(t.sub, 2)}</span></div>
        ${t.discount ? `<div><span>Discount ${q.discount}%</span><span>−${money(t.discount, 2)}</span></div>` : ''}
        <div><span>VAT 20%</span><span>${money(t.vat, 2)}</span></div>
        <div class="grand"><span>Total</span><span>${money(t.total, 2)}</span></div>
      </div>
      ${q.notes ? `<p class="eyebrow" style="margin-top:20px">Notes and exclusions</p><p class="small">${esc(q.notes)}</p>` : ''}
      ${internal ? `<div class="card flat noprint" style="margin:18px 0 0;background:#F7F9FB"><p class="eyebrow">Internal only</p><p style="margin:0">Cost ${money(t.cost)} · Margin <strong>${Math.round(t.margin * 100)}%</strong> · Prepared by ${esc(q.owner)}</p></div>` : ''}
      <footer class="doc-foot">
        <span class="small muted">${esc(b.name)} · Injectaclad Approved Installer</span>
        ${b.cobrand ? `<span class="powered">QA records by ${wordmark()}</span>` : ''}
      </footer>
    </article>`;
}

// ---------- Detail ----------
export async function viewQuote(ctx, id) {
  const { main, sess } = ctx;
  db.sweepQuotes();
  const q = db.quote(id);
  if (!q || (sess.role === 'client' && (q.clientId !== sess.clientId || q.status === 'draft'))) { main.innerHTML = '<p class="empty card">Quote not found.</p>'; setAction(main, null); return; }
  const isStaff = staff(sess);
  const c = db.client(q.clientId);
  const t = db.quoteTotals(q);
  const steps = [['Created', q.createdAt], ['Sent', q.sentAt], [q.status === 'declined' ? 'Lost' : q.status === 'expired' ? 'Expired' : 'Won', q.decidedAt]];
  const at = q.decidedAt ? 2 : q.sentAt ? 1 : 0;

  main.innerHTML = `
    <a class="btn sm ghost noprint" href="#/quotes" style="margin:-8px 0 8px -12px">${I.back}Quotes</a>
    <section class="card noprint">
      <div class="spread top"><div style="min-width:0"><p class="eyebrow"><span class="mono">${esc(q.ref)}</span></p><h1 style="margin:0 0 4px">${esc(q.title)}</h1><p class="muted" style="margin:0">${esc(c?.name)} · ${esc(q.contact)}</p></div>${quoteChip(q)}</div>
      <div class="spread" style="margin-top:16px;align-items:flex-end">
        <div><p class="eyebrow" style="margin:0">Total inc. VAT</p><div class="big">${moneyK(t.total)}</div></div>
        ${isStaff ? `<div style="text-align:right"><p class="eyebrow" style="margin:0">Margin</p><div style="font-size:22px;font-weight:700">${Math.round(t.margin * 100)}%</div></div>` : ''}
      </div>
      <div class="trail" style="margin:18px 0 0">
        <div class="line"><span class="fill" style="width:calc(${at * 50}% - ${at * 8}px)"></span>${steps.map((_, i) => `<i class="${i < at || (i === at && q.decidedAt) ? 'done' : i === at ? 'now' : ''}"></i>`).join('')}</div>
        <div class="meta">${steps.map(([l, d]) => `<span class="small"><strong>${l}</strong><br><span class="muted">${d ? dateShort(d) : '—'}</span></span>`).join('')}</div>
      </div>
      ${q.lostReason ? `<p class="small" style="margin:14px 0 0;color:var(--red);font-weight:700">Lost: ${esc(q.lostReason)}</p>` : ''}
      ${db.site(q.jobId) && staff(sess) ? `<a class="btn block" style="margin-top:14px" href="#/jobs/${q.jobId}">${I.sites}Open job</a>` : q.jobId === 'delivered' ? '<p class="small muted" style="margin:14px 0 0">Delivered before Injectatrace records began.</p>' : ''}
    </section>
    <div class="twocol">
      <div>
        <div class="spread noprint" style="margin:6px 0 10px"><h2 style="margin:0">Quotation</h2><button type="button" class="btn sm" id="print">${I.file}Print / PDF</button></div>
        ${quoteDoc(q, { internal: isStaff })}
      </div>
      <div class="noprint">
        ${sectionHead(`Files <span class="mono muted" style="font-size:15px">${q.files.length}</span>`)}
        <div class="group" id="files">${fileRows(q)}</div>
      </div>
    </div>`;

  main.querySelector('#print').addEventListener('click', () => window.print());
  wireFileRows(main.querySelector('#files'), q);

  // Actions depend on status and role.
  let html = '';
  if (isStaff) {
    if (q.status === 'draft') html = '<button class="btn secondary" id="edit">Edit</button><button class="btn primary" id="send">Send to client</button>';
    else if (q.status === 'sent') html = '<button class="btn danger secondary" id="lost">Mark lost</button><button class="btn good" id="won">' + I.check + 'Mark won</button>';
    else if (q.status === 'accepted' && !q.jobId) html = `<button class="btn primary" id="mkjob">${I.sites}Create job</button>`;
    else if (q.status !== 'accepted') html = '<button class="btn primary" id="dup">Re-quote</button>';
  } else if (q.status === 'sent') {
    html = '<button class="btn secondary" id="decline">Decline</button><button class="btn good" id="accept">' + I.check + 'Accept quote</button>';
  }
  const bar = setAction(main, html || null);
  if (!bar) return;
  const on = (sel, fn) => bar.querySelector(sel)?.addEventListener('click', fn);
  on('#edit', () => { db.S().quoteDraft = { ...structuredClone(q), step: 0 }; db.persist(); location.hash = `#/quotes/${q.id}/edit`; });
  on('#send', () => sendQuote(ctx, q));
  on('#won', () => { Object.assign(q, { status: 'accepted', decidedAt: Date.now(), lostReason: '' }); db.persist(); toast('Marked as won'); ctx.render(); });
  on('#lost', () => openSheet({
    title: 'Why was it lost?',
    body: `<div class="stack" style="gap:8px">${db.LOST_REASONS.map((r, i) => `<label class="choice"><input type="radio" name="why" value="${esc(r)}" ${i === 0 ? 'checked' : ''}><span style="justify-content:flex-start;padding:10px 14px">${esc(r)}</span></label>`).join('')}</div>`,
    primary: 'Mark lost',
    onPrimary: (sh) => { Object.assign(q, { status: 'declined', decidedAt: Date.now(), lostReason: sh.querySelector('[name=why]:checked').value }); db.persist(); toast('Marked as lost'); ctx.render(); },
  }));
  on('#dup', () => {
    const nq = { ...structuredClone(q), id: uid(), ref: db.nextQuoteRef(), status: 'draft', createdAt: Date.now(), sentAt: null, decidedAt: null, lostReason: '', jobId: null, owner: sess.name };
    db.S().quotes.push(nq); db.persist(); toast(`${nq.ref} created`); location.hash = `#/quotes/${nq.id}`;
  });
  on('#mkjob', () => createJobSheet(ctx, q));
  on('#accept', () => openSheet({
    title: 'Accept quote',
    body: `<p>Accepting <strong>${esc(q.ref)}</strong> for <strong>${money(t.total, 2)}</strong> inc. VAT.</p>
      <label class="toggle"><span>I'm authorised to accept on behalf of ${esc(c?.name)}</span><input type="checkbox" id="auth"></label>`,
    primary: 'Accept quote',
    onOpen: (sh) => { const b = sh.querySelector('[data-primary]'); b.disabled = true; sh.querySelector('#auth').addEventListener('change', (e) => { b.disabled = !e.target.checked; }); },
    onPrimary: () => { Object.assign(q, { status: 'accepted', decidedAt: Date.now(), acceptedBy: sess.name }); db.persist(); toast('Quote accepted. Thank you.'); ctx.render(); },
  }));
  on('#decline', () => openSheet({
    title: 'Decline quote',
    body: `<div class="field"><label for="why">Reason <span class="muted">(optional)</span></label><select id="why"><option value="">Prefer not to say</option>${db.LOST_REASONS.slice(0, 4).map((r) => `<option>${esc(r)}</option>`).join('')}</select></div>`,
    primary: 'Decline',
    onPrimary: (sh) => { Object.assign(q, { status: 'declined', decidedAt: Date.now(), lostReason: sh.querySelector('#why').value || 'Declined by client' }); db.persist(); toast('Quote declined'); ctx.render(); },
  }));
}

function sendQuote(ctx, q) {
  const c = db.client(q.clientId);
  const portal = c?.portal === 'active' || c?.portal === 'invited';
  openSheet({
    title: `Send ${q.ref}`,
    body: `
      <div class="group">${(c?.contacts || []).map((p, i) => rowItem({ lead: avatar(p.name, 36), title: esc(p.name), sub: esc(p.email), trail: `<input type="checkbox" data-to="${i}" ${p.name === q.contact ? 'checked' : ''} aria-label="Send to ${esc(p.name)}" style="width:24px;height:24px">` })).join('')}</div>
      <p class="small muted">${portal ? `${esc(c.name)} can view and accept this in their client portal.` : `${esc(c?.name)} has no portal access yet; they'll get the PDF by email. Set up their portal under More → Clients.`}</p>`,
    primary: 'Send quote',
    onPrimary: () => {
      Object.assign(q, { status: 'sent', sentAt: Date.now() });
      db.persist();
      toast(portal ? 'Sent. Visible in client portal.' : 'Sent by email');
      ctx.render();
    },
  });
}

function fileRows(q, { removable = false } = {}) {
  return q.files.map((f, i) => rowItem({
    lead: `<span class="bubble b-${/image/.test(f.type) ? 'orange' : 'navy'}">${I.file}</span>`,
    title: f.id ? `<a href="#" data-open="${f.id}">${esc(f.name)}</a>` : esc(f.name),
    sub: `${fileSize(f.size)} · ${dateShort(f.at)}`,
    trail: removable ? `<button type="button" class="btn sm ghost" data-rm="${i}" aria-label="Remove ${esc(f.name)}">${I.x}</button>` : '',
  })).join('') || '<div class="empty small">No files attached.</div>';
}
function wireFileRows(host, q, onRemove) {
  host.addEventListener('click', async (e) => {
    const open = e.target.closest('[data-open]');
    if (open) { e.preventDefault(); const u = await fileURL(open.dataset.open); if (u) window.open(u, '_blank'); else toast('File not on this device'); }
    const rm = e.target.closest('[data-rm]');
    if (rm) { const [gone] = q.files.splice(+rm.dataset.rm, 1); if (gone?.id) deleteFile(gone.id).catch(() => {}); onRemove?.(); }
  });
}

// ---------- Convert to job ----------
function createJobSheet(ctx, q) {
  const ops = db.S().operatives;
  openSheet({
    title: 'Create job',
    body: `
      <div class="field"><label for="jn">Job name</label><input id="jn" type="text" value="${esc(q.title)}"></div>
      <div class="field"><label for="ja">Site address</label><input id="ja" type="text" value="${esc(q.address)}" placeholder="Street, town, postcode"></div>
      <fieldset class="field"><legend>Elevations</legend>
        <div class="choices c2">${['North', 'East', 'South', 'West'].map((e, i) => `<label class="choice"><input type="checkbox" name="el" value="${e}" ${i % 2 === 0 ? 'checked' : ''}><span>${e}</span></label>`).join('')}</div></fieldset>
      <div class="field"><label for="tp">Target hold points</label>${stepper('tp', 60, { step: 5, min: 5, max: 1000, label: 'Target hold points', unit: 'HP' })}</div>
      <fieldset class="field"><legend>Assign installers</legend>
        <div class="group" style="margin:0">${ops.map((o, i) => rowItem({ lead: avatar(o.name, 36), title: esc(o.name), sub: esc(o.role), trail: `<input type="checkbox" name="op" value="${o.id}" ${i < 2 ? 'checked' : ''} aria-label="Assign ${esc(o.name)}" style="width:24px;height:24px">` })).join('')}</div>
        <p class="hint">Only assigned installers see this job on their phone.</p></fieldset>
      <p class="small muted">Client <strong>${esc(db.client(q.clientId)?.name)}</strong> will see progress in their portal. Quote files are copied into the job's documents.</p>`,
    primary: 'Create job',
    onOpen: (sh) => wireSteppers(sh),
    onPrimary: (sh) => {
      const name = sh.querySelector('#jn').value.trim();
      const els = [...sh.querySelectorAll('[name=el]:checked')].map((x) => x.value);
      const team = [...sh.querySelectorAll('[name=op]:checked')].map((x) => x.value);
      if (!name || !els.length || !team.length) { toast('Add a name, an elevation and an installer'); return false; }
      const st = db.createJob({ name, address: sh.querySelector('#ja').value.trim(), clientId: q.clientId, fireRating: q.fireRating, targetPins: +sh.querySelector('#tp').value || 60, elevations: els, team, quoteId: q.id, files: q.files });
      q.jobId = st.id; db.persist();
      toast('Job created');
      location.hash = `#/jobs/${st.id}`;
    },
  });
}

// ---------- Builder ----------
function newDraft(sess) {
  return {
    id: null, step: 0, ref: db.nextQuoteRef(), clientId: '', contact: '', title: '', address: '', fireRating: 60,
    lines: [], discount: 0, validDays: 30, notes: 'Price based on drawings supplied. Assumes clear access to cavities and working hours 08:00–17:00 Mon–Fri. Excludes making good to finishes.',
    files: [], owner: sess.name, calc: { lm: 300, sock: 'sock80' },
  };
}

export function viewQuoteBuilder(ctx, id) {
  let d = db.S().quoteDraft;
  if (id && (!d || d.id !== id)) {
    const q = db.quote(id);
    if (!q) { location.hash = '#/quotes'; return; }
    d = { ...structuredClone(q), step: 0, calc: { lm: 300, sock: 'sock80' } };
  }
  if (!id && (!d || d.id)) d = newDraft(ctx.sess);
  db.S().quoteDraft = d; db.persist();
  drawBuilder(ctx, d);
}

function drawBuilder(ctx, d) {
  const { main } = ctx;
  const save = () => { db.S().quoteDraft = d; db.persist(); };
  const c = db.client(d.clientId);
  const t = db.quoteTotals(d);
  let body = '';

  if (d.step === 0) {
    body = `
      <h1>${d.id ? `Edit ${esc(d.ref)}` : 'New quote'}</h1>
      <div class="field"><label for="cl">Client</label>
        <div class="row" style="flex-wrap:nowrap"><select id="cl"><option value="">Choose client…</option>${db.S().clients.map((x) => `<option value="${x.id}" ${x.id === d.clientId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        <button type="button" class="btn iconbtn" id="newcl" aria-label="Add new client">${I.plus}</button></div></div>
      ${c ? `<div class="field"><label for="ct">Contact</label><select id="ct">${c.contacts.map((p) => `<option ${p.name === d.contact ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>` : ''}
      <div class="field"><label for="ti">Job name</label><input id="ti" type="text" value="${esc(d.title)}" placeholder="e.g. Harbour View Tower, phase 2"></div>
      <div class="field"><label for="ad">Site address</label><input id="ad" type="text" value="${esc(d.address)}" placeholder="Street, town, postcode"></div>
      <fieldset class="field"><legend>Fire rating</legend>
        <div class="choices c2">${db.FIRE_RATINGS.map((r) => `<label class="choice"><input type="radio" name="fr" value="${r}" ${r === d.fireRating ? 'checked' : ''}><span>${r} min</span></label>`).join('')}</div></fieldset>`;
  } else if (d.step === 1) {
    body = `
      <p class="eyebrow">${esc(c?.name)} · ${esc(d.title)}</p>
      <h1>Scope and price</h1>
      <section class="card" style="background:#F7F9FB">
        <p class="eyebrow">Quick build from measurements</p>
        <div class="field"><label for="lm">Total cavity barrier length</label>${stepper('lm', d.calc.lm, { step: 10, min: 0, max: 50000, label: 'Linear metres', unit: 'm' })}</div>
        <fieldset class="field"><legend>Sock size</legend>
          <div class="choices c5">${db.SOCK_SIZES.map((mm) => `<label class="choice"><input type="radio" name="sk" value="sock${mm}" ${d.calc.sock === `sock${mm}` ? 'checked' : ''}><span>${mm}</span></label>`).join('')}</div></fieldset>
        <button type="button" class="btn block" id="build">${d.lines.length ? 'Rebuild lines' : 'Build lines'}</button>
        <p class="hint">Adds sock, pins (2/m), access holes (1 per 3m), survey, labour, MEWP and prelims at your price-book rates. Edit any line after.</p>
      </section>
      ${sectionHead('Lines', '', '')}
      <div class="group" id="lines">
        ${d.lines.map((l, i) => `<button type="button" class="qline" data-line="${i}" style="width:100%;background:none;border-left:0;border-right:0;border-bottom:0;font:inherit;color:inherit;text-align:left;cursor:pointer">
            <span><span class="d">${esc(l.desc)}</span><br><span class="m">${+l.qty.toFixed(2)} ${esc(l.unit)} × ${money(l.rate, 2)}</span></span><span class="t">${money(l.qty * l.rate)}</span></button>`).join('') || '<div class="empty small">No lines yet. Build from measurements or add a line.</div>'}
        <div class="totals">
          <div><span>Subtotal</span><span>${money(t.sub)}</span></div>
          ${t.discount ? `<div><span>Discount ${d.discount}%</span><span>−${money(t.discount)}</span></div>` : ''}
          <div class="grand"><span>Total ex VAT</span><span>${money(t.net)}</span></div>
          <div class="small muted"><span>Internal margin</span><span>${Math.round(t.margin * 100)}% · cost ${money(t.cost)}</span></div>
        </div>
      </div>
      <button type="button" class="btn block" id="addline">${I.plus}Add line</button>
      <div class="field" style="margin-top:20px"><label for="disc">Discount</label>${stepper('disc', d.discount, { step: 1, min: 0, max: 50, label: 'Discount', unit: '%' })}</div>`;
  } else if (d.step === 2) {
    body = `
      <p class="eyebrow">${esc(c?.name)} · ${esc(d.title)}</p>
      <h1>Files</h1>
      <p class="muted">Drawings, specifications, site photos, tender documents. Stored with the quote and copied to the job if you win it.</p>
      <label class="dropzone" id="dz">
        <input type="file" multiple id="up" aria-label="Upload files">
        ${I.upload}<strong>Tap to upload</strong><span class="small muted">or drop files here · PDF, images, DWG, Excel</span>
      </label>
      <div class="group" id="files" style="margin-top:14px">${fileRows(d, { removable: true })}</div>`;
  } else {
    body = `
      <h1>Review and send</h1>
      <div class="field"><label for="vd">Valid for</label>${stepper('vd', d.validDays, { step: 15, min: 15, max: 180, label: 'Validity', unit: 'days' })}</div>
      <div class="field"><label for="nt">Notes and exclusions</label><textarea id="nt" rows="3">${esc(d.notes)}</textarea></div>
      ${quoteDoc({ ...d, sentAt: null, createdAt: d.createdAt || Date.now() }, { internal: true })}`;
  }

  main.innerHTML = `<div class="narrow">${trail(STEPS, d.step)}${body}</div>`;
  window.scrollTo(0, 0);
  const last = d.step === STEPS.length - 1;
  const bar = setAction(main, `
    ${d.step > 0 ? '<button type="button" class="btn secondary" id="back">Back</button>' : '<a class="btn secondary" href="#/quotes" id="cancel">Cancel</a>'}
    ${last ? '<button type="button" class="btn secondary" id="savedraft">Save draft</button><button type="button" class="btn primary" id="sendnow">Send</button>' : `<button type="button" class="btn primary" id="next">Next${d.step === 1 && t.net ? ` · ${moneyK(t.net)}` : ''}</button>`}`);
  const next = bar.querySelector('#next');
  const ok = () => [d.clientId && d.title.trim(), d.lines.length > 0, true, true][d.step];
  const refresh = () => { if (next) next.disabled = !ok(); };
  refresh();
  bar.querySelector('#back')?.addEventListener('click', () => { d.step--; save(); drawBuilder(ctx, d); });
  bar.querySelector('#cancel')?.addEventListener('click', () => { db.S().quoteDraft = null; db.persist(); });
  next?.addEventListener('click', () => { if (!ok()) return; d.step++; save(); drawBuilder(ctx, d); });
  const finish = (send) => {
    const q = commit(d);
    db.S().quoteDraft = null; db.persist();
    if (send) { location.hash = `#/quotes/${q.id}`; setTimeout(() => sendQuote(ctx, q), 50); } else { toast(`${q.ref} saved as draft`); location.hash = `#/quotes/${q.id}`; }
  };
  bar.querySelector('#savedraft')?.addEventListener('click', () => finish(false));
  bar.querySelector('#sendnow')?.addEventListener('click', () => finish(true));

  if (d.step === 0) {
    main.querySelector('#cl').addEventListener('change', (e) => { d.clientId = e.target.value; d.contact = db.client(d.clientId)?.contacts[0]?.name || ''; save(); drawBuilder(ctx, d); });
    main.querySelector('#ct')?.addEventListener('change', (e) => { d.contact = e.target.value; save(); });
    main.querySelector('#ti').addEventListener('input', (e) => { d.title = e.target.value; save(); refresh(); });
    main.querySelector('#ad').addEventListener('input', (e) => { d.address = e.target.value; save(); });
    main.querySelectorAll('[name=fr]').forEach((r) => r.addEventListener('change', () => { d.fireRating = +r.value; save(); }));
    main.querySelector('#newcl').addEventListener('click', () => clientSheet(ctx, (cl) => { d.clientId = cl.id; d.contact = cl.contacts[0]?.name || ''; save(); drawBuilder(ctx, d); }));
  }

  if (d.step === 1) {
    wireSteppers(main, (k, v) => {
      if (k === 'lm') d.calc.lm = v || 0;
      if (k === 'disc') { d.discount = v || 0; save(); drawBuilder(ctx, d); return; }
      save();
    });
    main.querySelectorAll('[name=sk]').forEach((r) => r.addEventListener('change', () => { d.calc.sock = r.value; save(); }));
    main.querySelector('#build').addEventListener('click', () => {
      const lm = d.calc.lm || 0;
      if (!lm) { toast('Enter the length first'); return; }
      const mk = (key, qty) => { const c2 = db.CATALOGUE.find((x) => x.key === key); return { id: uid(), key, desc: c2.desc, unit: c2.unit, qty, rate: c2.rate, cost: c2.cost }; };
      d.lines = [mk(d.calc.sock, lm), mk('pins', Math.round(lm * 2)), mk('holes', Math.round(lm / 3)), mk('survey', Math.max(1, Math.round(lm / 400))), mk('labour', Math.max(2, Math.round(lm / 55))), mk('mewp', Math.max(1, Math.round(lm / 300))), mk('prelims', 1)];
      save(); drawBuilder(ctx, d); toast(`${d.lines.length} lines added`);
    });
    main.querySelector('#addline').addEventListener('click', () => lineSheet(d, null, () => { save(); drawBuilder(ctx, d); }));
    main.querySelectorAll('[data-line]').forEach((b) => b.addEventListener('click', () => lineSheet(d, +b.dataset.line, () => { save(); drawBuilder(ctx, d); })));
  }

  if (d.step === 2) {
    const dz = main.querySelector('#dz');
    const add = async (files) => {
      for (const f of files) {
        const id = uid();
        try { await putFile(id, f); d.files.push({ id, name: f.name, size: f.size, type: f.type, at: Date.now() }); } catch { toast('Could not store file'); }
      }
      save(); main.querySelector('#files').innerHTML = fileRows(d, { removable: true });
      if (files.length) toast(`${files.length} file${files.length > 1 ? 's' : ''} added`);
    };
    main.querySelector('#up').addEventListener('change', (e) => { add([...e.target.files]); e.target.value = ''; });
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove('over')));
    dz.addEventListener('drop', (e) => { e.preventDefault(); add([...e.dataTransfer.files]); });
    wireFileRows(main.querySelector('#files'), d, () => { save(); main.querySelector('#files').innerHTML = fileRows(d, { removable: true }); });
  }

  if (d.step === 3) {
    wireSteppers(main, (k, v) => { if (k === 'vd') { d.validDays = v || 30; save(); } });
    main.querySelector('#nt').addEventListener('input', (e) => { d.notes = e.target.value; save(); });
  }
}

function commit(d) {
  const { step, calc, ...data } = d;
  if (data.id) { Object.assign(db.quote(data.id), data); db.persist(); return db.quote(data.id); }
  const q = { ...data, id: uid(), status: 'draft', createdAt: Date.now(), sentAt: null, decidedAt: null, lostReason: '', jobId: null };
  db.S().quotes.push(q); db.persist();
  return q;
}

function lineSheet(d, i, done) {
  const l = i == null ? null : d.lines[i];
  const groups = [...new Set(db.CATALOGUE.map((c) => c.group))];
  openSheet({
    title: l ? 'Edit line' : 'Add line',
    body: `
      ${l ? '' : `<div class="field"><label for="cat">From price book</label><select id="cat"><option value="">Custom line…</option>${groups.map((g) => `<optgroup label="${g}">${db.CATALOGUE.filter((c) => c.group === g).map((c) => `<option value="${c.key}">${esc(c.desc)} · ${money(c.rate, 2)}/${c.unit}</option>`).join('')}</optgroup>`).join('')}</select></div>`}
      <div class="field"><label for="ld">Description</label><input id="ld" type="text" value="${esc(l?.desc || '')}"></div>
      <div class="field"><label for="lq">Quantity</label>${stepper('lq', l?.qty ?? 1, { step: 1, min: 0, max: 100000, label: 'Quantity', unit: l?.unit || '' })}</div>
      <div class="field"><label for="lr">Rate</label>${stepper('lr', l?.rate ?? 0, { step: 0.5, min: 0, max: 100000, label: 'Rate', unit: '£' })}</div>`,
    primary: l ? 'Save line' : 'Add line',
    secondary: l ? 'Delete' : null,
    onOpen: (sh) => {
      wireSteppers(sh);
      sh.querySelector('#cat')?.addEventListener('change', (e) => {
        const c = db.CATALOGUE.find((x) => x.key === e.target.value);
        if (!c) return;
        sh.querySelector('#ld').value = c.desc;
        sh.querySelector('#lr').value = c.rate;
        sh.querySelector('#lq').closest('.unit').dataset.unit = c.unit;
        sh._cat = c;
      });
    },
    onPrimary: (sh) => {
      const desc = sh.querySelector('#ld').value.trim();
      const qty = +sh.querySelector('#lq').value, rate = +sh.querySelector('#lr').value;
      if (!desc || !(qty > 0)) { toast('Add a description and quantity'); return false; }
      if (l) Object.assign(l, { desc, qty, rate });
      else { const c = sh._cat; d.lines.push({ id: uid(), key: c?.key || 'custom', desc, unit: c?.unit || 'item', qty, rate, cost: c ? c.cost : rate * 0.6 }); }
      done();
    },
    onSecondary: (sh, close) => { d.lines.splice(i, 1); close(); done(); },
  });
}

// Shared with client setup.
export function clientSheet(ctx, onDone, existing = null) {
  openSheet({
    title: existing ? 'Edit client' : 'New client',
    body: `
      <div class="field"><label for="cn">Company</label><input id="cn" type="text" value="${esc(existing?.name || '')}" placeholder="e.g. Castlefield Developments"></div>
      ${existing ? '' : `
      <div class="field"><label for="pn">Main contact</label><input id="pn" type="text" placeholder="Name"></div>
      <div class="field"><label for="pe">Email</label><input id="pe" type="email" placeholder="name@company.co.uk"></div>
      <div class="field"><label for="pp">Phone <span class="muted">(optional)</span></label><input id="pp" type="text" inputmode="tel"></div>`}`,
    primary: existing ? 'Save' : 'Add client',
    onPrimary: (sh) => {
      const name = sh.querySelector('#cn').value.trim();
      if (!name) { toast('Enter the company name'); return false; }
      if (existing) { existing.name = name; db.persist(); onDone?.(existing); return; }
      const pn = sh.querySelector('#pn').value.trim();
      const c = { id: uid(), name, contacts: pn ? [{ name: pn, email: sh.querySelector('#pe').value.trim(), phone: sh.querySelector('#pp').value.trim(), role: 'Main contact' }] : [], portal: 'none', invitedAt: null };
      db.S().clients.push(c); db.persist(); toast('Client added');
      onDone?.(c);
    },
  });
}

export { spec };
