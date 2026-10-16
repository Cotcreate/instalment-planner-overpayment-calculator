// Contractor admin: More hub, client setup portal, branding.
import * as db from './store.js';
import { clientSheet, quoteRow } from './quotes.js';
import {
  esc, I, toast, setAction, openSheet, avatar, rowItem, tile, iconBubble, sectionHead, wordmark, dateShort, ring,
} from './ui.js';

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
  const pending = db.S().pins.filter((p) => p.qa === 'pending').length;
  main.innerHTML = `
    <div class="pagehead"><div><p class="eyebrow">${esc(db.S().branding.name)}</p><h1>More</h1></div></div>
    <div class="tiles">
      ${tile({ href: '#/clients', icon: I.company, title: 'Clients', sub: `${db.S().clients.length} clients · portal access`, tone: 'navy' })}
      ${tile({ href: '#/company', icon: I.qa, title: 'Team & compliance', sub: 'Operatives, insurance, accreditations', tone: alerts ? 'orange' : 'green', badge: alerts ? `<span class="chip c-amber">${alerts}</span>` : '' })}
      ${isMgr ? tile({ href: '#/qa', icon: I.check, title: 'QA queue', sub: 'Pass or send back hold points', tone: pending ? 'red' : 'green', badge: pending ? `<span class="chip c-red">${pending}</span>` : '' }) : tile({ href: '#/reports', icon: I.dashboard, title: 'Reports', sub: 'Quote performance and exports', tone: 'navy' })}
      ${isMgr ? tile({ href: '#/branding', icon: I.pen, title: 'Branding', sub: 'Your logo on the app, quotes and portal', tone: 'orange' }) : tile({ href: '#/jobs', icon: I.sites, title: 'Jobs', sub: 'All live and complete jobs', tone: 'navy' })}
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
  const { main } = ctx;
  const b = db.S().branding;
  main.innerHTML = `
    <a class="btn sm ghost" href="#/more" style="margin:-8px 0 8px -12px">${I.back}More</a>
    <div class="pagehead"><div><p class="eyebrow">Make it yours</p><h1>Branding</h1></div></div>
    <p class="muted">Your logo replaces ours across the app, on quotes and in your clients' portal.</p>

    <section class="card">
      <p class="eyebrow">Preview</p>
      <div class="brandprev">
        <div class="bar"><img src="${b.logo}" alt="${esc(b.name)} logo"><span class="avatar" style="width:32px;height:32px;background:var(--navy);font-size:12px">DW</span></div>
        <div style="padding:16px">
          <div class="hero" style="margin:0;padding:16px"><p class="eyebrow">Client portal</p><h3 style="margin:0;color:#fff">Harbour View Tower</h3><p class="sub small" style="margin:4px 0 0">68% of hold points passed QA</p></div>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="field"><label for="bn">Company name</label><input id="bn" type="text" value="${esc(b.name)}"></div>
      <p class="label">Logo</p>
      <label class="dropzone" id="dz"><input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" id="lg" aria-label="Upload logo">
        ${I.upload}<strong>Upload logo</strong><span class="small muted">SVG or PNG on a transparent background works best</span></label>
      <label class="toggle" style="margin-top:12px"><span>Show "QA records by Injectatrace" on quotes</span><input type="checkbox" id="cb" ${b.cobrand ? 'checked' : ''}></label>
    </section>
    <button class="btn ghost block" id="reset">Reset to placeholder logo</button>`;

  main.querySelector('#bn').addEventListener('change', (e) => { b.name = e.target.value.trim() || b.name; db.persist(); toast('Name saved'); });
  main.querySelector('#cb').addEventListener('change', (e) => { b.cobrand = e.target.checked; db.persist(); });
  main.querySelector('#lg').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      b.logo = f.type === 'image/svg+xml' ? await readDataURL(f) : await shrinkLogo(f);
      db.persist(); toast('Logo updated'); ctx.render();
    } catch { toast('Could not read that image'); }
  });
  main.querySelector('#reset').addEventListener('click', () => { db.resetBranding(); toast('Placeholder logo restored'); ctx.render(); });
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
