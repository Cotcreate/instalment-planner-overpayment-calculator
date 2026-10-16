// Quote reporting dashboard + report generation (CSV exports and a print-ready summary).
import * as db from './store.js';
import { barChart } from './chart.js';
import { esc, I, setAction, moneyK, money, downloadFile, csv, date, sectionHead, coLogo } from './ui.js';

const DAY = 86400000;
const PERIODS = { q: ['Last 3 months', 91], y: ['Last 12 months', 365], all: ['All time', 1e5] };

export function viewReports(ctx, params) {
  const { main } = ctx;
  db.sweepQuotes();
  const p = PERIODS[params.get('p')] ? params.get('p') : 'y';
  const since = Date.now() - PERIODS[p][1] * DAY;
  const scope = db.quotesFor(ctx.sess);
  const qs = scope.filter((q) => q.status !== 'draft' && q.createdAt >= since);
  const val = (q) => db.quoteTotals(q).net;
  const won = qs.filter((q) => q.status === 'accepted');
  const lost = qs.filter((q) => q.status === 'declined' || q.status === 'expired');
  const decided = won.length + lost.length;
  const quoted = qs.reduce((t, q) => t + val(q), 0);
  const wonV = won.reduce((t, q) => t + val(q), 0);
  const open = scope.filter((q) => q.status === 'sent');
  const days = qs.filter((q) => q.decidedAt && q.sentAt).map((q) => (q.decidedAt - q.sentAt) / DAY);
  const avgDays = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0;
  const margin = won.length ? won.reduce((t, q) => t + db.quoteTotals(q).margin * val(q), 0) / (wonV || 1) : 0;

  // Won value per month (12 months, by decision date).
  const months = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const v = scope.filter((q) => q.status === 'accepted' && q.decidedAt >= d && q.decidedAt < end).reduce((t, q) => t + val(q), 0);
    months.push({ label: d.toLocaleDateString('en-GB', { month: 'short' }).slice(0, 3), detail: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), value: +(v / 1000).toFixed(1) });
  }

  const byStatus = ['sent', 'accepted', 'declined', 'expired'].map((s) => {
    const list = scope.filter((q) => q.status === s && (s === 'sent' || q.createdAt >= since));
    return { label: db.QUOTE_STATUS[s].label + (s === 'sent' ? ' (open)' : ''), n: list.length, v: list.reduce((t, q) => t + val(q), 0), cls: s === 'accepted' ? 'won' : '' };
  });
  const byClient = Object.values(qs.reduce((m, q) => {
    const c = db.client(q.clientId);
    m[q.clientId] ||= { label: c?.name || '—', quoted: 0, won: 0 };
    m[q.clientId].quoted += val(q);
    if (q.status === 'accepted') m[q.clientId].won += val(q);
    return m;
  }, {})).sort((a, b) => b.quoted - a.quoted).slice(0, 6);
  const reasons = Object.entries(lost.reduce((m, q) => { const r = q.lostReason || (q.status === 'expired' ? 'Expired, no response' : 'Unknown'); m[r] = (m[r] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
  const byInst = Object.values(qs.reduce((m, q) => {
    const c = db.companyOf(q.installerCoId);
    if (!c) return m;
    m[c.id] ||= { co: c, quoted: 0, won: 0 };
    m[c.id].quoted += val(q);
    if (q.status === 'accepted') m[c.id].won += val(q);
    return m;
  }, {})).sort((a, b) => b.won - a.won);
  const maxI = Math.max(1, ...byInst.map((x) => x.quoted));
  const byOwner = Object.values(qs.reduce((m, q) => {
    m[q.owner] ||= { label: q.owner, n: 0, w: 0, d: 0 };
    m[q.owner].n++;
    if (q.status === 'accepted') m[q.owner].w++;
    if (q.status !== 'sent') m[q.owner].d++;
    return m;
  }, {}));

  const maxS = Math.max(1, ...byStatus.map((s) => s.v));
  const maxC = Math.max(1, ...byClient.map((c) => c.quoted));
  const maxR = Math.max(1, ...reasons.map((r) => r[1]));

  main.innerHTML = `
    <div class="pagehead"><div><p class="eyebrow">Quotes · ${esc(PERIODS[p][0])}</p><h1>Reports</h1></div>
      <button type="button" class="btn sm noprint" id="gen">${I.file}Generate</button></div>
    <nav class="seg noprint" aria-label="Period">${Object.entries(PERIODS).map(([k, [l]]) => `<a href="#/reports?p=${k}" ${k === p ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>

    <section class="hero">
      <p class="eyebrow">Won · ex VAT</p>
      <div class="big">${moneyK(wonV)}</div>
      <p class="sub" style="margin:4px 0 0">${won.length} of ${qs.length} quotes · ${moneyK(quoted)} quoted</p>
      <div class="hero-stats" style="margin-bottom:0">
        <div><b>${decided ? Math.round((won.length / decided) * 100) : 0}%</b><span>Win rate</span></div>
        <div><b>${quoted ? Math.round((wonV / quoted) * 100) : 0}%</b><span>By value</span></div>
        <div><b>${Math.round(margin * 100)}%</b><span>Margin</span></div>
      </div>
    </section>

    <div class="tiles">
      <div class="tile" style="min-height:0"><span class="tile-sub">Open pipeline</span><span class="tile-title" style="font-size:24px">${moneyK(open.reduce((t, q) => t + val(q), 0))}</span><span class="tile-sub">${open.length} awaiting decision</span></div>
      <div class="tile" style="min-height:0"><span class="tile-sub">Average quote</span><span class="tile-title" style="font-size:24px">${moneyK(qs.length ? quoted / qs.length : 0)}</span><span class="tile-sub">ex VAT</span></div>
      <div class="tile" style="min-height:0"><span class="tile-sub">Time to decision</span><span class="tile-title" style="font-size:24px">${avgDays} days</span><span class="tile-sub">sent → won / lost</span></div>
      <div class="tile" style="min-height:0"><span class="tile-sub">Quotes issued</span><span class="tile-title" style="font-size:24px">${qs.length}</span><span class="tile-sub">${esc(PERIODS[p][0].toLowerCase())}</span></div>
    </div>

    <div class="twocol" style="margin-top:14px">
      <section class="card">
        <p class="eyebrow">Won value per month · £k</p>
        <p class="muted small">Last 12 months by decision date. Tap a bar for detail.</p>
        <div id="chart"></div>
      </section>
      <section class="card">
        <p class="eyebrow">Pipeline by status · value</p>
        <ul class="bars">${byStatus.map((s) => `<li><span class="lbl">${esc(s.label)} <span class="muted small">· ${s.n}</span></span><span class="val">${moneyK(s.v)}</span><span class="track"><i class="${s.cls}" style="width:${(s.v / maxS) * 100}%"></i></span></li>`).join('')}</ul>
      </section>
    </div>

    <div class="twocol">
      <section class="card">
        <div class="spread"><p class="eyebrow" style="margin:0">Top clients</p>
          <span class="legend" style="margin:0"><span><span class="dot" style="color:var(--mist)"></span>Quoted</span><span><span class="dot" style="color:var(--green)"></span>Won</span></span></div>
        <ul class="bars" style="margin-top:12px">${byClient.map((c) => `<li><span class="lbl">${esc(c.label)}</span><span class="val">${moneyK(c.won)} <span class="muted small">/ ${moneyK(c.quoted)}</span></span>
          <span class="track" style="position:relative;background:var(--tint)"><i style="position:absolute;inset:0 auto 0 0;width:${(c.quoted / maxC) * 100}%;background:var(--mist)"></i><i class="won" style="position:absolute;inset:0 auto 0 0;width:${(c.won / maxC) * 100}%"></i></span></li>`).join('') || '<li class="muted">No quotes in this period.</li>'}</ul>
      </section>
      <section class="card">
        <p class="eyebrow">Why quotes were lost</p>
        <ul class="bars">${reasons.map(([r, n]) => `<li><span class="lbl">${esc(r)}</span><span class="val">${n}</span><span class="track"><i style="width:${(n / maxR) * 100}%"></i></span></li>`).join('') || '<li class="muted">Nothing lost in this period.</li>'}</ul>
        <p class="eyebrow" style="margin-top:22px">By installer company · won / quoted</p>
        <ul class="bars">${byInst.map((x) => `<li><span class="lbl" style="display:flex;align-items:center;gap:8px">${coLogo(x.co, 52, 28)}${esc(x.co.name)}</span><span class="val">${moneyK(x.won)} <span class="muted small">/ ${moneyK(x.quoted)}</span></span><span class="track" style="position:relative"><i style="position:absolute;inset:0 auto 0 0;width:${(x.quoted / maxI) * 100}%;background:var(--mist)"></i><i class="won" style="position:absolute;inset:0 auto 0 0;width:${(x.won / maxI) * 100}%"></i></span></li>`).join('')}</ul>
        <p class="eyebrow" style="margin-top:22px">By estimator</p>
        <ul class="bars">${byOwner.map((o) => `<li><span class="lbl">${esc(o.label)} <span class="muted small">· ${o.n} quotes</span></span><span class="val">${o.d ? Math.round((o.w / o.d) * 100) : 0}% won</span><span class="track"><i class="won" style="width:${o.d ? (o.w / o.d) * 100 : 0}%"></i></span></li>`).join('')}</ul>
      </section>
    </div>`;

  ctx.cleanups.push(barChart(main.querySelector('#chart'), { data: months, unit: '£k', label: 'Won value per month in thousands of pounds' }).destroy);

  main.querySelector('#gen').addEventListener('click', () => {
    import('./ui.js').then(({ openSheet, rowItem, iconBubble }) => openSheet({
      title: 'Generate report',
      body: `<div class="group">
        ${rowItem({ lead: iconBubble(I.file, 'navy'), title: 'Quote register (CSV)', sub: `Every quote, ${PERIODS[p][0].toLowerCase()}, for Excel`, attrs: 'data-r="register" role="button" tabindex="0"' })}
        ${rowItem({ lead: iconBubble(I.dashboard, 'green'), title: 'Monthly summary (CSV)', sub: 'Quoted, won and win rate by month', attrs: 'data-r="monthly" role="button" tabindex="0"' })}
        ${rowItem({ lead: iconBubble(I.records, 'orange'), title: 'Print or save as PDF', sub: 'This dashboard, formatted for A4', attrs: 'data-r="print" role="button" tabindex="0"' })}
      </div>`,
      primary: null,
      onOpen: (sh, close) => sh.querySelectorAll('[data-r]').forEach((r) => {
        const go = () => { close(); setTimeout(() => runReport(r.dataset.r, qs, months), 250); };
        r.style.cursor = 'pointer';
        r.addEventListener('click', go);
        r.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      }),
    }));
  });
  setAction(main, null);
}

function runReport(kind, qs, months) {
  const stamp = new Date().toISOString().slice(0, 10);
  if (kind === 'print') return window.print();
  if (kind === 'register') {
    const rows = [['Ref', 'Client', 'Contractor', 'Installer', 'Job', 'Status', 'Created', 'Sent', 'Decided', 'Net £', 'VAT £', 'Total £', 'Margin %', 'Lost reason', 'Prepared by']];
    qs.forEach((q) => {
      const t = db.quoteTotals(q);
      rows.push([q.ref, db.client(q.clientId)?.name, db.companyOf(q.contractorId)?.name, db.companyOf(q.installerCoId)?.name, q.title, db.QUOTE_STATUS[q.status].label, date(q.createdAt), q.sentAt ? date(q.sentAt) : '', q.decidedAt ? date(q.decidedAt) : '', t.net.toFixed(2), t.vat.toFixed(2), t.total.toFixed(2), Math.round(t.margin * 100), q.lostReason, q.owner]);
    });
    downloadFile(`quote-register-${stamp}.csv`, csv(rows));
  }
  if (kind === 'monthly') {
    const rows = [['Month', 'Won £k']];
    months.forEach((m) => rows.push([m.detail, m.value]));
    downloadFile(`quotes-monthly-${stamp}.csv`, csv(rows));
  }
}

export { money, sectionHead };
