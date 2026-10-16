// Home screens for staff (manager / back office) and clients. One hero, a short to-do list, previews.
import * as db from './store.js';
import { quoteRow } from './quotes.js';
import { esc, I, setAction, rowItem, iconBubble, sectionHead, ring, moneyK, avatar } from './ui.js';

const DAY = 86400000;
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const today = () => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

export function jobRow(st, { sess } = {}) {
  const s = db.siteStats(st);
  const staff = sess?.role === 'manager' || sess?.role === 'office';
  return rowItem({
    href: `#/jobs/${st.id}`,
    lead: ring(s.pct, 48, `${s.pct}% QA passed`),
    title: esc(st.name),
    sub: `${esc(db.clientName(st))} · FR ${st.fireRating} min${st.status === 'complete' ? ' · complete' : ''}`,
    trail: staff && s.pending ? `<span class="chip c-red">${s.pending} QA</span>` : s.rejected && staff ? `<span class="chip c-amber">${s.rejected} rework</span>` : `<span class="muted small">${s.approved}/${st.targetPins}</span>`,
  });
}

export function viewHome(ctx) {
  const { sess } = ctx;
  if (sess.role === 'client') return clientHome(ctx);
  const { main } = ctx;
  db.sweepQuotes();
  const sites = db.S().sites.filter((s) => s.status === 'active');
  const quotes = db.S().quotes;
  const open = quotes.filter((q) => q.status === 'sent');
  const pending = db.S().pins.filter((p) => p.qa === 'pending').length;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const wonMonth = quotes.filter((q) => q.status === 'accepted' && q.decidedAt >= monthStart).reduce((t, q) => t + db.quoteTotals(q).net, 0);
  const expiring = open.filter((q) => db.quoteExpiry(q) - Date.now() < 7 * DAY);
  const drafts = quotes.filter((q) => q.status === 'draft');
  const alerts = db.alerts();
  const compliance = alerts.filter((a) => a.href === '#/company');
  const jobIssues = alerts.filter((a) => a.href !== '#/company');
  const toWin = quotes.filter((q) => q.status === 'accepted' && !q.jobId);

  const todo = [
    pending && { href: '#/qa', tone: 'red', icon: I.qa, title: `${pending} hold point${pending > 1 ? 's' : ''} awaiting QA`, sub: 'Pass them or send back for rework' },
    toWin.length && { href: `#/quotes/${toWin[0].id}`, tone: 'green', icon: I.sites, title: `${toWin.length} won quote${toWin.length > 1 ? 's' : ''} to set up as a job`, sub: esc(toWin[0].title) },
    expiring.length && { href: '#/quotes?f=open', tone: 'orange', icon: I.clock, title: `${expiring.length} quote${expiring.length > 1 ? 's' : ''} expiring this week`, sub: 'Chase before they lapse' },
    drafts.length && { href: '#/quotes?f=open', tone: 'navy', icon: I.file, title: `${drafts.length} draft quote${drafts.length > 1 ? 's' : ''} to send`, sub: esc(drafts[0].title) },
    jobIssues.length && { href: jobIssues[0].href, tone: 'orange', icon: I.alert, title: `${jobIssues.length} job document${jobIssues.length > 1 ? 's' : ''} or sign-offs missing`, sub: esc(jobIssues[0].text) },
    compliance.length && { href: '#/company', tone: 'orange', icon: I.company, title: `${compliance.length} compliance item${compliance.length > 1 ? 's' : ''} expiring`, sub: esc(compliance[0].text) },
  ].filter(Boolean);

  main.innerHTML = `
    <p class="eyebrow">${today()}</p>
    <h1>${greet()}, ${esc(sess.name.split(' ')[0])}</h1>

    <section class="hero">
      <p class="eyebrow">Open pipeline</p>
      <div class="big">${moneyK(open.reduce((t, q) => t + db.quoteTotals(q).net, 0))}</div>
      <p class="sub" style="margin:4px 0 0">${open.length} quote${open.length === 1 ? '' : 's'} with clients · ex VAT</p>
      <div class="hero-stats">
        <div><b>${sites.length}</b><span>Live jobs</span></div>
        <div><b>${pending}</b><span>To QA</span></div>
        <div><b>${moneyK(wonMonth)}</b><span>Won · month</span></div>
      </div>
      <div class="row" style="flex-wrap:nowrap">
        <a class="btn accent" style="flex:1.3" href="#/quotes/new">${I.plus}New quote</a>
        <a class="btn ghostlight" style="flex:1" href="#/quotes">Pipeline</a>
      </div>
    </section>

    <div class="twocol">
      <div>
        ${sectionHead('Needs you')}
        <div class="group">${todo.slice(0, 5).map((t) => rowItem({ href: t.href, lead: iconBubble(t.icon, t.tone), title: t.title, sub: t.sub })).join('')
          || rowItem({ lead: iconBubble(I.check, 'green'), title: 'All clear', sub: 'Nothing waiting on you' })}</div>
        ${sectionHead('Live jobs', 'All jobs', '#/jobs')}
        <div class="group">${sites.slice(0, 4).map((s) => jobRow(s, { sess })).join('')}</div>
      </div>
      <div>
        ${sectionHead('Recent quotes', 'All quotes', '#/quotes?f=all')}
        <div class="group">${quotes.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 4).map(quoteRow).join('')}</div>
      </div>
    </div>`;
  setAction(main, null);
}

function clientHome(ctx) {
  const { main, sess } = ctx;
  const c = db.client(sess.clientId);
  const jobs = db.sitesFor(sess);
  const lead = jobs.find((s) => s.status === 'active') || jobs[0];
  const s = lead ? db.siteStats(lead) : null;
  const toReview = db.quotesFor(sess).filter((q) => q.status === 'sent');

  main.innerHTML = `
    <p class="eyebrow">${esc(c?.name)}</p>
    <h1>${greet()}, ${esc(sess.name.split(' ')[0])}</h1>
    ${lead ? `
    <section class="hero">
      <div class="hero-row">
        <div style="min-width:0"><p class="eyebrow">Live job</p><h2 style="margin:0 0 4px">${esc(lead.name)}</h2><p class="sub small" style="margin:0">${s.approved} of ${lead.targetPins} hold points passed QA</p></div>
        ${ring(s.pct, 84, `${s.pct}% complete`)}
      </div>
      <div class="hero-stats">
        <div><b>${s.approved}</b><span>QA passed</span></div>
        <div><b>${s.pending}</b><span>In review</span></div>
        <div><b>${Math.round(s.lm)}m</b><span>Installed</span></div>
      </div>
      <a class="btn accent block" href="#/jobs/${lead.id}">View progress</a>
    </section>` : '<div class="card empty">No jobs shared with you yet.</div>'}
    ${toReview.length ? `${sectionHead('Quotes for your review')}<div class="group">${toReview.map(quoteRow).join('')}</div>` : ''}
    ${jobs.length > 1 ? `${sectionHead('Your jobs')}<div class="group">${jobs.map((j) => jobRow(j, { sess })).join('')}</div>` : ''}
    ${sectionHead('Your contractor')}
    <div class="group">${rowItem({ lead: `<img src="${db.S().branding.logo}" alt="" style="height:36px;width:auto;max-width:120px;object-fit:contain">`, title: esc(db.S().branding.name), sub: 'Injectaclad Approved Installer' })}</div>`;
  setAction(main, null);
}

export { avatar };
