// Contractor admin: More hub, client setup portal, branding.
import * as db from './store.js';
import { clientSheet, quoteRow } from './quotes.js';
import {
  esc, I, toast, setAction, openSheet, avatar, rowItem, tile, iconBubble, sectionHead, wordmark, dateShort, ring, coLogo, uid,
} from './ui.js';
import { jobRow } from './home.js';

const PORTAL = {
  active: '<span class="chip c-green">Portal active</span>',
  invited: '<span class="chip c-amber">Invite sent</span>',
  none: '<span class="chip c-slate">No portal</span>',
};

// ---------- More ----------
export function viewMore(ctx) {
  const { main, sess } = ctx;
  const isMgr = sess.role === 'manager';
  const alerts = db.alerts().length;
  const ids = new Set(db.sitesFor(sess).map((x) => x.id));
  const pending = db.S().pins.filter((p) => p.qa === 'pending' && ids.has(p.siteId)).length;
  const inst = db.companiesOf('installer').length, con = db.companiesOf('contractor').length;
  main.innerHTML = `
    <div class="pagehead"><div><p class="eyebrow">${esc(db.brandFor(sess).name)}</p><h1>More</h1></div></div>
    <div class="tiles">
      ${isMgr ? '' : tile({ href: '#/companies', icon: I.sites, title: 'Companies', sub: `${inst} installers · ${con} contractors`, tone: 'orange' })}
      ${tile({ href: '#/clients', icon: I.company, title: 'Clients', sub: `${db.S().clients.length} clients · portal access`, tone: 'navy' })}
      ${tile({ href: '#/company', icon: I.qa, title: 'Team & compliance', sub: 'Operatives, insurance, accreditations', tone: alerts ? 'orange' : 'green', badge: alerts ? `<span class="chip c-amber">${alerts}</span>` : '' })}
      ${isMgr ? tile({ href: '#/qa', icon: I.check, title: 'QA queue', sub: 'Pass or send back hold points', tone: pending ? 'red' : 'green', badge: pending ? `<span class="chip c-red">${pending}</span>` : '' }) : tile({ href: '#/reports', icon: I.dashboard, title: 'Reports', sub: 'Quote performance and exports', tone: 'navy' })}
      ${isMgr ? tile({ href: '#/branding', icon: I.pen, title: 'Branding', sub: 'Your logo on the app, quotes and portal', tone: 'orange' }) : ''}
    </div>
    ${sectionHead('Account')}
    <div class="group">
      ${rowItem({ lead: avatar(sess.name, 40), title: esc(sess.name), sub: esc(sess.email) })}
      ${rowItem({ lead: iconBubble(I.logout, 'slate'), title: 'Sign out', attrs: 'data-signout role="button" tabindex="0" style="cursor:pointer"' })}
    </div>
    <p class="powered" style="justify-content:center;width:100%;margin-top:24px">Powered by ${wordmark()}</p>`;
  main.querySelector('[data-signout]').addEventListener('click', () => document.getElementById('signout').click());
  setAction(main, null);
}

// ---------- Companies (Injectaclad backend) ----------
const TYPE = { installer: 'Installer', contractor: 'Contractor' };

export async function logoFromFile(f) {
  if (f.type === 'image/svg+xml') return readDataURL(f);
  return shrinkLogo(f);
}

// Add a company (installer or contractor) with its logo. Used here and from the quote builder.
export function companySheet(type, onDone) {
  let logo = null;
  openSheet({
    title: `Add ${TYPE[type].toLowerCase()} company`,
    body: `
      <div class="field"><label for="kn">Company name</label><input id="kn" type="text" autocomplete="off"></div>
      <div class="field"><label for="kc">Main contact <span class="muted">(optional)</span></label><input id="kc" type="text"></div>
      <div class="field"><label for="ke">Email <span class="muted">(optional)</span></label><input id="ke" type="email"></div>
      <p class="label">Logo</p>
      <div class="row" style="flex-wrap:nowrap;gap:12px;align-items:center">
        <span id="kprev">${coLogo(null, 96, 56)}</span>
        <label class="capture" style="flex:1"><input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" id="kl" aria-label="Upload company logo"><span class="btn block">${I.upload}Upload logo</span></label>
      </div>
      <p class="hint">Shown on every job this company works on, so it's easy to spot.</p>`,
    primary: 'Add company',
    onOpen: (sh) => sh.querySelector('#kl').addEventListener('change', async (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      try { logo = await logoFromFile(f); sh.querySelector('#kprev').innerHTML = coLogo({ logo, name: 'logo' }, 96, 56); } catch { toast('Could not read that image'); }
    }),
    onPrimary: (sh) => {
      const name = sh.querySelector('#kn').value.trim();
      if (!name) { toast('Enter the company name'); return false; }
      const c = { id: uid(), type, name, logo, contact: sh.querySelector('#kc').value.trim(), email: sh.querySelector('#ke').value.trim() };
      db.S().companies.push(c); db.persist(); toast(`${name} added`);
      onDone?.(c);
    },
  });
}

export function viewCompanies(ctx, params) {
  const { main } = ctx;
  const t = params?.get('t') === 'contractor' ? 'contractor' : 'installer';
  const list = db.companiesOf(t).slice().sort((a, b) => a.name.localeCompare(b.name));
  const jobsOf = (c) => db.S().sites.filter((s) => (t === 'installer' ? s.installerCoId : s.contractorId) === c.id);
  main.innerHTML = `
    <a class="btn sm ghost" href="#/more" style="margin:-8px 0 8px -12px">${I.back}More</a>
    <div class="pagehead"><div><p class="eyebrow">Injectaclad network</p><h1>Companies</h1></div><button class="btn primary sm" id="add">${I.plus}Add</button></div>
    <nav class="seg" aria-label="Company type">${[['installer', 'Installers'], ['contractor', 'Contractors']].map(([k, l]) => `<a href="#/companies?t=${k}" ${k === t ? 'aria-current="page"' : ''}>${l} <span class="n">${db.companiesOf(k).length}</span></a>`).join('')}</nav>
    <div class="group">${list.map((c) => {
      const js = jobsOf(c);
      const live = js.filter((s) => s.status === 'active').length;
      const ops = db.S().operatives.filter((o) => o.companyId === c.id).length;
      return rowItem({ href: `#/companies/${c.id}`, lead: coLogo(c, 88, 52), title: esc(c.name), sub: `${live} live job${live === 1 ? '' : 's'}${t === 'installer' ? ` · ${ops} operative${ops === 1 ? '' : 's'}` : ` · ${db.S().quotes.filter((q) => q.contractorId === c.id).length} quotes`}` });
    }).join('') || '<div class="empty">None yet.</div>'}</div>`;
  main.querySelector('#add').addEventListener('click', () => companySheet(t, (c) => { location.hash = `#/companies/${c.id}`; }));
  setAction(main, null);
}

export function viewCompanyCard(ctx, id) {
  const { main, sess } = ctx;
  const c = db.companyOf(id);
  if (!c) { main.innerHTML = '<p class="empty card">Company not found.</p>'; setAction(main, null); return; }
  const jobs = db.S().sites.filter((s) => (c.type === 'installer' ? s.installerCoId : s.contractorId) === c.id);
  const ops = db.S().operatives.filter((o) => o.companyId === c.id);
  main.innerHTML = `
    <a class="btn sm ghost" href="#/companies?t=${c.type}" style="margin:-8px 0 8px -12px">${I.back}Companies</a>
    <section class="card" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      ${coLogo(c, 140, 80)}
      <div style="flex:1;min-width:180px"><p class="eyebrow" style="margin:0">${TYPE[c.type]}</p><h1 style="margin:2px 0 4px">${esc(c.name)}</h1><p class="muted small" style="margin:0">${esc(c.contact || '')}${c.email ? ` · ${esc(c.email)}` : ''}</p></div>
      <label class="capture"><input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" id="kl" aria-label="Replace logo"><span class="btn sm">${I.upload}${c.logo ? 'Replace logo' : 'Upload logo'}</span></label>
    </section>
    ${sectionHead(`Jobs <span class="mono muted" style="font-size:15px">${jobs.length}</span>`, 'New quote', `#/quotes/new?${c.type}=${c.id}`)}
    <div class="group">${jobs.map((s) => jobRow(s, { sess })).join('') || '<div class="empty small">No jobs yet.</div>'}</div>
    ${c.type === 'installer' ? `
      ${sectionHead(`Operatives <span class="mono muted" style="font-size:15px">${ops.length}</span>`)}
      <div class="group">${ops.map((o) => rowItem({ lead: avatar(o.name, 40), title: esc(o.name), sub: esc(o.role) })).join('') || '<div class="empty small">No operatives yet.</div>'}
        ${rowItem({ lead: iconBubble(I.plus, 'slate'), title: 'Add operative', attrs: 'id="addop" role="button" tabindex="0" style="cursor:pointer"' })}</div>` : ''}`;
  main.querySelector('#kl').addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { c.logo = await logoFromFile(f); db.persist(); toast('Logo updated'); ctx.render(); } catch { toast('Could not read that image'); }
  });
  main.querySelector('#addop')?.addEventListener('click', () => openSheet({
    title: `Add operative to ${c.name}`,
    body: `<div class="field"><label for="on">Name</label><input id="on" type="text"></div>
      <fieldset class="field"><legend>Role</legend><div class="choices c3">${db.ROLES.map((r, i) => `<label class="choice"><input type="radio" name="or" value="${r}" ${i === 0 ? 'checked' : ''}><span>${r}</span></label>`).join('')}</div></fieldset>`,
    primary: 'Add operative',
    onPrimary: (sh) => {
      const name = sh.querySelector('#on').value.trim();
      if (!name) { toast('Enter a name'); return false; }
      db.S().operatives.push({ id: uid(), companyId: c.id, name, role: sh.querySelector('[name=or]:checked').value, rate: 24, email: '', quals: ['Injecta Fire Barrier installer training', 'IPAF 3a/3b (MEWP)', 'CSCS card'].map((n) => ({ id: uid(), name: n, expiry: '', file: null })) });
      db.persist(); toast('Operative added'); ctx.render();
    },
  }));
  setAction(main, null);
}

// ---------- Clients ----------
export function viewClients(ctx) {
  const { main } = ctx;
  const cs = db.S().clients.slice().sort((a, b) => a.name.localeCompare(b.name));
  main.innerHTML = `
    <a class="btn sm ghost" href="#/more" style="margin:-8px 0 8px -12px">${I.back}More</a>
    <div class="pagehead"><div><p class="eyebrow">Client setup</p><h1>Clients</h1></div><button class="btn primary sm" id="add">${I.plus}Add client</button></div>
    <p class="muted">Each client gets a portal branded with your logo. They only see jobs and quotes you assign to them.</p>
    <div class="group">${cs.map((c) => {
      const jobs = db.S().sites.filter((s) => s.clientId === c.id).length;
      const qs = db.S().quotes.filter((q) => q.clientId === c.id).length;
      return rowItem({ href: `#/clients/${c.id}`, lead: avatar(c.name, 44), title: esc(c.name), sub: `${jobs} job${jobs === 1 ? '' : 's'} · ${qs} quote${qs === 1 ? '' : 's'}`, trail: PORTAL[c.portal] });
    }).join('')}</div>`;
  main.querySelector('#add').addEventListener('click', () => clientSheet(ctx, (c) => { location.hash = `#/clients/${c.id}`; }));
  setAction(main, null);
}

export function viewClient(ctx, id) {
  const { main } = ctx;
  const c = db.client(id);
  if (!c) { main.innerHTML = '<p class="empty card">Client not found.</p>'; setAction(main, null); return; }
  const jobs = db.S().sites;
  const qs = db.S().quotes.filter((q) => q.clientId === c.id).sort((a, b) => b.createdAt - a.createdAt);
  const link = `${location.origin}${location.pathname}`;

  main.innerHTML = `
    <a class="btn sm ghost" href="#/clients" style="margin:-8px 0 8px -12px">${I.back}Clients</a>
    <div class="spread top" style="margin-bottom:16px">
      <div style="display:flex;gap:14px;align-items:center;min-width:0">${avatar(c.name, 56)}<div style="min-width:0"><h1 style="margin:0">${esc(c.name)}</h1><p class="muted" style="margin:2px 0 0">${c.contacts.length} contact${c.contacts.length === 1 ? '' : 's'}</p></div></div>
      <button class="btn iconbtn" id="edit" aria-label="Edit client">${I.pen}</button>
    </div>

    <section class="card">
      <div class="spread"><div><p class="eyebrow">Client portal</p><h3 style="margin:0">${c.portal === 'active' ? 'Active' : c.portal === 'invited' ? `Invite sent ${dateShort(c.invitedAt)}` : 'Not set up'}</h3></div>${PORTAL[c.portal]}</div>
      <p class="muted small" style="margin:10px 0 14px">They'll see your logo, live progress on their jobs, QA-passed hold points, documents and any quotes you send them. Pail quantities, rates and costs stay hidden.</p>
      <div class="row" style="flex-wrap:nowrap">
        <button class="btn primary" id="invite" style="flex:1.4" ${c.contacts.length ? '' : 'disabled'}>${c.portal === 'none' ? 'Send portal invite' : 'Resend invite'}</button>
        <button class="btn" id="copy" style="flex:1">Copy link</button>
      </div>
    </section>

    ${sectionHead('Contacts', '', '')}
    <div class="group">
      ${c.contacts.map((p) => rowItem({ lead: avatar(p.name, 40), title: esc(p.name), sub: `${esc(p.role || '')}${p.role ? ' · ' : ''}${esc(p.email)}`, trail: p.phone ? `<a class="btn sm ghost" href="tel:${esc(p.phone.replace(/\s/g, ''))}" aria-label="Call ${esc(p.name)}">Call</a>` : '' })).join('') || '<div class="empty small">No contacts yet.</div>'}
      ${rowItem({ lead: iconBubble(I.plus, 'slate'), title: 'Add contact', attrs: 'id="addc" role="button" tabindex="0" style="cursor:pointer"' })}
    </div>

    ${sectionHead('Jobs they can see')}
    <p class="muted small" style="margin-top:-4px">Assign a job to this client to show it in their portal. A job belongs to one client.</p>
    <div class="group">${jobs.map((s) => {
      const st = db.siteStats(s);
      const mine = s.clientId === c.id;
      return rowItem({ lead: ring(st.pct, 44), title: esc(s.name), sub: mine ? 'Visible in portal' : `Assigned to ${esc(db.clientName(s))}`, trail: `<input type="checkbox" data-job="${s.id}" ${mine ? 'checked' : ''} aria-label="Show ${esc(s.name)} to ${esc(c.name)}" style="width:26px;height:26px">` });
    }).join('')}</div>

    ${sectionHead(`Quotes <span class="mono muted" style="font-size:15px">${qs.length}</span>`, qs.length ? 'New quote' : '', '#/quotes/new')}
    <div class="group">${qs.slice(0, 5).map(quoteRow).join('') || '<div class="empty small">No quotes yet.</div>'}</div>`;

  main.querySelector('#edit').addEventListener('click', () => clientSheet(ctx, () => ctx.render(), c));
  main.querySelector('#invite').addEventListener('click', () => {
    Object.assign(c, { portal: c.portal === 'active' ? 'active' : 'invited', invitedAt: Date.now() });
    db.persist();
    toast(`Invite sent to ${c.contacts[0].email}`);
    ctx.render();
  });
  main.querySelector('#copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(link); toast('Portal link copied'); } catch { toast(link); }
  });
  main.querySelector('#addc').addEventListener('click', () => openSheet({
    title: 'Add contact',
    body: `
      <div class="field"><label for="n">Name</label><input id="n" type="text"></div>
      <div class="field"><label for="r">Role</label><input id="r" type="text" placeholder="e.g. Site manager"></div>
      <div class="field"><label for="e">Email</label><input id="e" type="email"></div>
      <div class="field"><label for="p">Phone <span class="muted">(optional)</span></label><input id="p" type="text" inputmode="tel"></div>`,
    primary: 'Add contact',
    onPrimary: (sh) => {
      const name = sh.querySelector('#n').value.trim();
      if (!name) { toast('Enter a name'); return false; }
      c.contacts.push({ name, role: sh.querySelector('#r').value.trim(), email: sh.querySelector('#e').value.trim(), phone: sh.querySelector('#p').value.trim() });
      db.persist(); toast('Contact added'); ctx.render();
    },
  }));
  main.querySelectorAll('[data-job]').forEach((cb) => cb.addEventListener('change', () => {
    const s = db.site(cb.dataset.job);
    if (cb.checked) { s.clientId = c.id; toast(`${s.name} now visible to ${c.name}`); }
    else if (s.clientId === c.id) { s.clientId = null; toast(`${s.name} hidden from ${c.name}`); }
    db.persist(); ctx.render();
  }));
  setAction(main, null);
}

// ---------- Branding ----------
export function viewBranding(ctx) {
  const { main, sess } = ctx;
  const c = db.companyOf(sess.companyId);
  const b = db.S().branding;
  main.innerHTML = `
    <a class="btn sm ghost" href="#/more" style="margin:-8px 0 8px -12px">${I.back}More</a>
    <div class="pagehead"><div><p class="eyebrow">Make it yours</p><h1>Branding</h1></div></div>
    <p class="muted">Your logo shows in your app, on your quotes and in your clients' portal. Injectaclad's own screens use the Injectaclad logo; installers on site see Injecta Fire Barrier.</p>
    <section class="card">
      <p class="eyebrow">Preview</p>
      <div class="brandprev">
        <div class="bar"><img src="${c.logo}" alt="${esc(c.name)} logo">${avatar(sess.name, 32)}</div>
        <div style="padding:16px"><div class="hero" style="margin:0;padding:16px"><p class="eyebrow">Client portal</p><h3 style="margin:0;color:#fff">Harbour View Tower</h3><p class="sub small" style="margin:4px 0 0">47% of hold points passed QA</p></div></div>
      </div>
    </section>
    <section class="card">
      <div class="field"><label for="bn">Company name</label><input id="bn" type="text" value="${esc(c.name)}"></div>
      <p class="label">Logo</p>
      <label class="dropzone" id="dz"><input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" id="lg" aria-label="Upload logo">
        ${I.upload}<strong>Upload logo</strong><span class="small muted">SVG or PNG on a transparent background works best</span></label>
      <label class="toggle" style="margin-top:12px"><span>Show "QA records by Injectatrace" on quotes</span><input type="checkbox" id="cb" ${b.cobrand ? 'checked' : ''}></label>
    </section>
    <button class="btn ghost block" id="reset">Reset to placeholder logo</button>`;
  main.querySelector('#bn').addEventListener('change', (e) => { c.name = e.target.value.trim() || c.name; db.persist(); toast('Name saved'); });
  main.querySelector('#cb').addEventListener('change', (e) => { b.cobrand = e.target.checked; db.persist(); });
  main.querySelector('#lg').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { c.logo = await logoFromFile(f); db.persist(); toast('Logo updated'); ctx.render(); } catch { toast('Could not read that image'); }
  });
  main.querySelector('#reset').addEventListener('click', () => { db.resetBranding(c.id); toast('Placeholder logo restored'); ctx.render(); });
  setAction(main, null);
}

const readDataURL = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
async function shrinkLogo(f) {
  const bmp = await createImageBitmap(f);
  const k = Math.min(1, 600 / bmp.width, 200 / bmp.height);
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
