// Injectatrace app shell: sign-in, role-based navigation, routing, contractor branding.
import * as db from './store.js';
import { I, esc, wordmark, traceline, toast, avatar, openSheet, rowItem, iconBubble } from './ui.js';
import { viewProjects, viewCapture, viewDaily, viewRecords } from './installer.js';
import { viewJobs, viewJob, viewQA, viewCompany } from './office.js';
import { viewHome } from './home.js';
import { viewQuotes, viewQuote, viewQuoteBuilder } from './quotes.js';
import { viewReports } from './reports.js';
import { viewMore, viewClients, viewClient, viewBranding, viewCompanies, viewCompanyCard } from './admin.js';
import { viewPin } from './pin.js';

const main = document.getElementById('main');
const nav = document.querySelector('.bottomnav');
const top = document.querySelector('.topbar');
let cleanups = [];

const NAV = {
  manager: [['home', 'Home', I.dashboard], ['quotes', 'Quotes', I.file], ['jobs', 'Jobs', I.sites], ['reports', 'Reports', I.records], ['more', 'More', I.company]],
  office: [['home', 'Home', I.dashboard], ['quotes', 'Quotes', I.file], ['jobs', 'Jobs', I.sites], ['qa', 'QA', I.qa], ['more', 'More', I.company]],
  installer: [['today', 'Today', I.projects], ['capture', 'Capture', I.capture], ['daily', 'Daily', I.daily], ['records', 'Records', I.records]],
  client: [['home', 'Home', I.dashboard], ['jobs', 'Jobs', I.sites], ['quotes', 'Quotes', I.file]],
};
// Routes reachable from inside a section, and which tab they light up.
const EXTRA = {
  manager: { pin: 'jobs', qa: 'more', clients: 'more', company: 'more', branding: 'more' },
  office: { pin: 'qa', reports: 'more', clients: 'more', company: 'more', companies: 'more' },
  installer: { pin: 'records' },
  client: { pin: 'jobs' },
};
const HOME = { manager: 'home', office: 'home', installer: 'today', client: 'home' };
const ROLE = { manager: 'Contractor', office: 'Injectaclad', installer: 'Installer', client: 'Client' };
const DEMO = {
  manager: { email: 'dan@northernfacades.co.uk', name: 'Dan Whitaker', companyId: 'k1' },
  office: { email: 'gemma@injectaclad.co.uk', name: 'Gemma Hart' },
  installer: { email: 'jay@installer.co.uk', name: 'Jay Patel', operativeId: 'o1' },
  client: { email: 'priya.shah@northgatebuild.co.uk', name: 'Priya Shah', clientId: 'c1' },
};

function route() {
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0] || '', id: parts[1], tab: parts[2], params: new URLSearchParams(qs) };
}

function signIn() {
  document.body.classList.remove('has-nav');
  top.hidden = true; nav.hidden = true;
  document.querySelector('.actionbar')?.remove();
  main.classList.remove('has-action');
  main.style.padding = '0'; main.style.maxWidth = 'none';
  let role = 'office';
  const LABELS = { office: 'Injectaclad', manager: 'Contractor', installer: 'Installer', client: 'Client' };
  main.innerHTML = `
    <div class="signin">
      <div class="hero on-navy" style="border-radius:0;margin:0;box-shadow:none">
        ${wordmark()}
        <h1>Every installation.<br>Recorded the same way.</h1>
        <p>Provided free to Injectaclad Approved Installers.</p>
        ${traceline(3)}
      </div>
      <form id="f" novalidate>
        <h2>Sign in</h2>
        <fieldset class="field"><legend>Demo account</legend>
          <div class="choices c2">${Object.entries(LABELS).map(([k, l]) => `<label class="choice"><input type="radio" name="role" value="${k}" ${k === role ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
        </fieldset>
        <div class="field"><label for="em">Email</label><input id="em" type="email" autocomplete="username" value="${DEMO[role].email}"></div>
        <div class="field"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" value="demo-password"></div>
        <button class="btn primary block" type="submit">Sign in</button>
        <p class="hint" style="text-align:center;margin-top:16px">Demo build · data stays on this device</p>
      </form>
    </div>`;
  const f = main.querySelector('#f');
  f.querySelectorAll('[name=role]').forEach((r) => r.addEventListener('change', () => { role = r.value; f.querySelector('#em').value = DEMO[role].email; }));
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    db.setSession({ role, ...DEMO[role] });
    main.style.padding = ''; main.style.maxWidth = '';
    location.hash = `#/${HOME[role]}`;
    render();
  });
}

function chrome(sess, active) {
  document.body.classList.add('has-nav');
  top.hidden = false; nav.hidden = false;
  const b = db.brandFor(sess);
  top.querySelector('.brandslot').innerHTML = `<img src="${b.logo}" alt="${esc(b.name)}" style="${sess.role === 'installer' ? 'height:44px' : ''}">`;
  top.querySelector('#acct').innerHTML = `<span class="who">${esc(sess.name)}<small>${ROLE[sess.role]}</small></span>${avatar(sess.name, 38)}`;
  const ids = new Set(db.sitesFor(sess).map((x) => x.id));
  const pending = db.S().pins.filter((p) => p.qa === 'pending' && ids.has(p.siteId)).length;
  const rework = sess.role === 'installer' ? db.S().pins.filter((p) => p.qa === 'rejected' && p.operative === sess.operativeId).length : 0;
  const review = sess.role === 'client' ? db.quotesFor(sess).filter((q) => q.status === 'sent').length : 0;
  nav.innerHTML = `${NAV[sess.role].map(([k, l, icon]) => {
    const badge = k === 'qa' && pending ? pending : k === 'records' && rework ? rework : k === 'quotes' && review ? review : 0;
    return `<a href="#/${k}" ${k === active ? 'aria-current="page"' : ''}>${icon}<span>${l}</span>${badge ? `<span class="badge" aria-label="${badge} need attention">${badge}</span>` : ''}</a>`;
  }).join('')}`;
}

function render() {
  cleanups.forEach((fn) => fn());
  cleanups = [];
  document.getElementById('toast').classList.remove('show');
  // A sheet left open (e.g. phone back button) must not survive navigation.
  document.querySelectorAll('.sheet, .sheet-backdrop').forEach((x) => x.remove());
  document.body.style.overflow = '';
  const sess = db.session();
  const r = route();
  if (!sess || !NAV[sess.role]) return signIn();
  const tabs = NAV[sess.role].map((n) => n[0]);
  const extra = EXTRA[sess.role];
  if (!tabs.includes(r.name) && !extra[r.name]) { location.replace(`#/${HOME[sess.role]}`); return; }

  chrome(sess, tabs.includes(r.name) ? r.name : extra[r.name]);
  const ctx = { main, sess, render, cleanups };
  const titles = { home: 'Home', today: 'Today', capture: 'Capture', daily: 'Daily', records: 'Records', quotes: 'Quotes', jobs: 'Jobs', reports: 'Reports', qa: 'QA', more: 'More', clients: 'Clients', company: 'Team', branding: 'Branding', pin: 'Hold point' };
  document.title = `${titles[r.name] || 'Companies'} · ${db.brandFor(sess).name}`;

  const v = {
    home: () => viewHome(ctx),
    today: () => viewProjects(ctx),
    capture: () => viewCapture(ctx, r.params),
    daily: () => viewDaily(ctx, r.params),
    records: () => viewRecords(ctx, r.params),
    quotes: () => (r.id === 'new' ? viewQuoteBuilder(ctx, null, r.params) : r.id && r.tab === 'edit' ? viewQuoteBuilder(ctx, r.id) : r.id ? viewQuote(ctx, r.id) : viewQuotes(ctx, r.params)),
    jobs: () => (r.id ? viewJob(ctx, r.id, r.tab, r.params) : viewJobs(ctx, r.params)),
    reports: () => viewReports(ctx, r.params),
    qa: () => viewQA(ctx),
    more: () => viewMore(ctx),
    clients: () => (r.id ? viewClient(ctx, r.id) : viewClients(ctx)),
    company: () => viewCompany(ctx, r.params),
    branding: () => viewBranding(ctx),
    companies: () => (r.id ? viewCompanyCard(ctx, r.id) : viewCompanies(ctx, r.params)),
    pin: () => viewPin(ctx, r.id),
  };
  if ((r.name === 'quotes' && (r.id === 'new' || r.tab === 'edit')) && sess.role === 'client') { location.replace('#/quotes'); return; }
  if (['branding'].includes(r.name) && sess.role !== 'manager') { location.replace('#/more'); return; }
  v[r.name]();
}

function signOut() {
  db.setSession(null);
  db.clearDraft();
  location.hash = '#/';
  toast('Signed out');
}
top.querySelector('#signout').addEventListener('click', signOut);
top.querySelector('#acct').addEventListener('click', () => {
  const sess = db.session();
  openSheet({
    title: 'Account',
    body: `<div class="group">
      ${rowItem({ lead: avatar(sess.name, 44), title: esc(sess.name), sub: `${ROLE[sess.role]} · ${esc(sess.email)}` })}
      ${rowItem({ lead: iconBubble(I.logout, 'slate'), title: 'Sign out', attrs: 'id="so" role="button" tabindex="0" style="cursor:pointer"' })}
    </div>
    <p class="powered" style="justify-content:center;width:100%;margin-top:18px">Powered by ${wordmark()}</p>`,
    primary: null,
    onOpen: (sh, close) => sh.querySelector('#so').addEventListener('click', () => { close(); signOut(); }),
  });
});
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

function netStatus() {
  const n = document.getElementById('net');
  n.textContent = navigator.onLine ? '' : 'Offline';
  n.classList.toggle('off', !navigator.onLine);
}
window.addEventListener('online', netStatus);
window.addEventListener('offline', netStatus);
netStatus();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
