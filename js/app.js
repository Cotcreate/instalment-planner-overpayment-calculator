// Injectatrace app shell: sign-in, role-based navigation, routing.
import * as db from './store.js';
import { I, esc, wordmark, traceline, toast } from './ui.js';
import { viewProjects, viewCapture, viewDaily, viewRecords } from './installer.js';
import { viewDashboard, viewSites, viewSite, viewQA, viewCompany } from './office.js';
import { viewPin } from './pin.js';

const main = document.getElementById('main');
const nav = document.querySelector('.bottomnav');
const top = document.querySelector('.topbar');
let cleanups = [];

const NAV = {
  installer: [['projects', 'Projects', I.projects], ['capture', 'Capture', I.capture], ['daily', 'Daily', I.daily], ['records', 'Records', I.records]],
  office: [['dashboard', 'Overview', I.dashboard], ['sites', 'Sites', I.sites], ['qa', 'QA', I.qa], ['company', 'Company', I.company]],
  client: [['dashboard', 'Overview', I.dashboard], ['sites', 'Sites', I.sites]],
};
const HOME = { installer: 'projects', office: 'dashboard', client: 'dashboard' };
const ROLE_TAG = { installer: 'Installer', office: 'Back office', client: 'Client' };
const DEMO = {
  installer: { email: 'jay@installer.co.uk', name: 'Jay Patel', operativeId: 'o1' },
  office: { email: 'office@northernfacades.co.uk', name: 'Office' },
  client: { email: 'pm@northgatebuild.co.uk', name: 'Northgate Build' },
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
  let role = 'installer';
  main.innerHTML = `
    <div class="signin">
      <div class="hero on-navy">
        ${wordmark()}
        <h1>Every installation.<br>Recorded the same way.</h1>
        <p>Provided free to Injectaclad Approved Installers.</p>
        ${traceline(3)}
      </div>
      <form id="f" novalidate>
        <h2>Sign in</h2>
        <fieldset class="field"><legend>Demo account</legend>
          <div class="choices c3">${Object.entries(ROLE_TAG).map(([k, l]) => `<label class="choice"><input type="radio" name="role" value="${k}" ${k === role ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
        </fieldset>
        <div class="field"><label for="em">Email</label><input id="em" type="email" autocomplete="username" value="${DEMO[role].email}" placeholder="name@company.co.uk"></div>
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

function chrome(sess, r) {
  document.body.classList.add('has-nav');
  top.hidden = false; nav.hidden = false;
  top.querySelector('.roletag').textContent = `[${sess.role === 'office' ? 'Office' : ROLE_TAG[sess.role]}]`;
  const pending = db.S().pins.filter((p) => p.qa === 'pending').length;
  const rework = sess.role === 'installer' ? db.S().pins.filter((p) => p.qa === 'rejected' && p.operative === sess.operativeId).length : 0;
  const active = r.name === 'pin' ? (sess.role === 'installer' ? 'records' : sess.role === 'office' ? 'qa' : 'sites') : r.name;
  nav.innerHTML = NAV[sess.role].map(([k, l, icon]) => {
    const badge = k === 'qa' && pending ? pending : k === 'records' && rework ? rework : 0;
    return `<a href="#/${k}" ${k === active ? 'aria-current="page"' : ''}>${icon}<span>${l}</span>${badge ? `<span class="badge" aria-label="${badge} need attention">${badge}</span>` : ''}</a>`;
  }).join('');
}

function render() {
  cleanups.forEach((fn) => fn());
  cleanups = [];
  document.getElementById('toast').classList.remove('show');
  const sess = db.session();
  const r = route();
  if (!sess) return signIn();
  const allowed = NAV[sess.role].map((n) => n[0]).concat('pin');
  if (!allowed.includes(r.name)) { location.replace(`#/${HOME[sess.role]}`); return; }

  chrome(sess, r);
  const ctx = { main, sess, render, cleanups };
  const titles = { projects: 'Projects', capture: 'Capture', daily: 'Daily', records: 'Records', dashboard: 'Overview', sites: 'Sites', qa: 'QA', company: 'Company', pin: 'Hold point' };
  document.title = `${titles[r.name]} · Injectatrace`;

  if (r.name === 'projects') viewProjects(ctx);
  else if (r.name === 'capture') viewCapture(ctx, r.params);
  else if (r.name === 'daily') viewDaily(ctx, r.params);
  else if (r.name === 'records') viewRecords(ctx, r.params);
  else if (r.name === 'dashboard') viewDashboard(ctx);
  else if (r.name === 'sites' && r.id) viewSite(ctx, r.id, r.tab, r.params);
  else if (r.name === 'sites') viewSites(ctx);
  else if (r.name === 'qa') viewQA(ctx);
  else if (r.name === 'company') viewCompany(ctx);
  else if (r.name === 'pin') viewPin(ctx, r.id);
}

top.querySelector('#signout').addEventListener('click', () => {
  db.setSession(null);
  db.clearDraft();
  location.hash = '#/';
  toast('Signed out');
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

top.querySelector('.brandslot').innerHTML = wordmark();
render();
export { esc };
