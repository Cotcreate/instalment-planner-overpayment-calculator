// Mobile acceptance check: every screen for all three roles at 375px and 390px wide (plus tablet
// and desktop), the full hold point + daily + QA flows with touch input. Fails on horizontal scroll,
// tap targets under 48px, inputs under 16px or JS errors. Screenshots go to test-output/.
// Usage: npm test
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { serve } from '../scripts/serve.mjs';

const PORT = 4179;
const BASE = `http://localhost:${PORT}/`;
const OUT = 'test-output';
const VIEWPORTS = [
  { name: '375', width: 375, height: 812, mobile: true },
  { name: '390', width: 390, height: 844, mobile: true },
  { name: 'tablet', width: 820, height: 1180, mobile: true },
  { name: 'desktop', width: 1366, height: 900, mobile: false },
];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');

const failures = [];
const fail = (m) => { failures.push(m); console.log('  FAIL', m); };

async function audit(page, vp, label) {
  await page.waitForTimeout(120);
  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    const sel = 'a.btn, button, select, textarea, input[type=text], input[type=email], input[type=password], input[type=date], input[inputmode], .choice span, .bottomnav a, .capture, label.toggle, .tabs a';
    const small = [];
    for (const el of document.querySelectorAll(sel)) {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height || el.closest('[hidden]') || getComputedStyle(el).visibility === 'hidden') continue;
      if (el.closest('.capture') && el.tagName === 'SPAN') continue;
      if (b.width < 48 || b.height < 47.5) small.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    const tiny = [...document.querySelectorAll('select, textarea, input:not([type=file]):not([type=radio]):not([type=checkbox])')].filter((e) => e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 16).length;
    return { overflow: doc.scrollWidth - doc.clientWidth, small, tiny };
  });
  if (r.overflow > 0) fail(`[${vp.name}] ${label}: horizontal overflow ${r.overflow}px`);
  r.small.forEach((s) => fail(`[${vp.name}] ${label}: tap target under 48px: ${s}`));
  if (r.tiny) fail(`[${vp.name}] ${label}: ${r.tiny} inputs under 16px`);
  await page.screenshot({ path: `${OUT}/${vp.name}-${label}.png`, fullPage: true });
  console.log(`  ok  ${label}`);
}

async function signIn(page, role) {
  await page.goto(BASE);
  await page.waitForSelector('#f');
  await page.locator(`label.choice:has(input[value=${role}])`).click();
  await page.locator('#f button[type=submit]').click();
  await page.mouse.move(0, 0);
  await page.waitForSelector('.bottomnav a');
}

async function run(browser, vp) {
  console.log(`\n${vp.name} (${vp.width}x${vp.height})`);
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`[${vp.name}] JS error: ${e.message}`));
  const tap = (l) => (vp.mobile ? l.tap() : l.click());
  const go = async (hash, sel) => { await page.goto(`${BASE}#/${hash}`); await page.waitForSelector(sel); };

  // ---------- Sign in ----------
  await page.goto(BASE);
  await page.waitForSelector('#f');
  await audit(page, vp, '00-signin');

  // ---------- Installer ----------
  await signIn(page, 'installer');
  await page.waitForSelector('[data-rams]');
  const nav = await page.locator('.bottomnav').boundingBox();
  if (vp.width < 1024 && Math.abs(nav.y + nav.height - vp.height) > 1) fail(`[${vp.name}] bottom nav not pinned to bottom`);
  await audit(page, vp, '01-installer-projects');

  // RAMS must be signed before capture; sign with a finger.
  await tap(page.locator('[data-rams=s1]'));
  await page.waitForSelector('.sheet.open');
  await page.waitForTimeout(300);
  if (!(await page.locator('.sheet [data-primary]').isDisabled())) fail(`[${vp.name}] RAMS sign enabled before signature`);
  await page.locator('.sheet label.toggle').click();
  const pad = await page.locator('#sig').boundingBox();
  await page.mouse.move(pad.x + 30, pad.y + 100); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(pad.x + 30 + i * 20, pad.y + 100 + Math.sin(i) * 30);
  await page.mouse.up();
  await page.mouse.move(0, 0); // park the virtual mouse so it can't hover anything later
  await audit(page, vp, '02-installer-rams');
  await tap(page.locator('.sheet [data-primary]'));
  await page.waitForSelector('.sheet', { state: 'detached' });

  // Capture a hold point.
  await tap(page.locator('a[href="#/capture?site=s1"]'));
  await page.waitForSelector('.trail');
  await tap(page.locator('label.choice', { hasText: 'North' }));
  await audit(page, vp, '03-capture-location');
  await tap(page.locator('#next'));

  await page.waitForSelector('.elev-view');
  await page.waitForTimeout(200);
  const scale0 = await page.$eval('.elev-stage', (s) => new DOMMatrix(getComputedStyle(s).transform).a);
  await page.$eval('.elev-view', (v) => {
    const r = v.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const ev = (t, id, x) => v.dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: 'touch', clientX: x, clientY: cy, bubbles: true }));
    ev('pointerdown', 11, cx - 30); ev('pointerdown', 12, cx + 30);
    for (let i = 1; i <= 10; i++) { ev('pointermove', 11, cx - 30 - i * 8); ev('pointermove', 12, cx + 30 + i * 8); }
    ev('pointerup', 11, cx - 110); ev('pointerup', 12, cx + 110);
  });
  const scale1 = await page.$eval('.elev-stage', (s) => new DOMMatrix(getComputedStyle(s).transform).a);
  if (!(scale1 > scale0 * 1.5)) fail(`[${vp.name}] pinch did not zoom`);
  if (await page.locator('.elev-confirm').isVisible()) fail(`[${vp.name}] pinch dropped a pin`);
  await tap(page.locator('[data-z=fit]'));
  const box = await page.locator('.elev-view').boundingBox();
  const [tx, ty] = [box.x + box.width * 0.45, box.y + box.height * 0.45];
  if (vp.mobile) await page.touchscreen.tap(tx, ty); else await page.mouse.click(tx, ty);
  await page.waitForSelector('.elev-confirm:not([hidden])');
  if (!(await page.locator('#next').isDisabled())) fail(`[${vp.name}] Next enabled before pin confirmed`);
  await audit(page, vp, '04-capture-pin-confirm');
  await tap(page.locator('[data-c=ok]'));
  await page.waitForFunction(() => document.querySelector('#pinstate').textContent.includes('Pinned'));
  await tap(page.locator('#next'));

  await page.waitForSelector('#cavityDepth');
  if (!(await page.locator('#next').isDisabled())) fail(`[${vp.name}] Next enabled with empty measurements`);
  for (let i = 0; i < 20; i++) await tap(page.locator('[aria-label="Increase Cavity depth"]'));
  await tap(page.locator('label.choice:has(input[name=sock0][value="80"])'));
  await tap(page.locator('label.toggle'));
  await tap(page.locator('label.choice:has(input[name=sock1][value="60"])'));
  await page.locator('#length').fill('3.5');
  for (let i = 0; i < 6; i++) await tap(page.locator('[aria-label="Increase Pins installed"]'));
  await page.locator('#batch').fill('ifb-2431');
  if (await page.locator('#cavityDepth').inputValue() !== '100') fail(`[${vp.name}] cavity stepper wrong`);
  if (await page.locator('#next').isDisabled()) fail(`[${vp.name}] Next disabled with complete measurements`);
  await audit(page, vp, '05-capture-measurements');
  await tap(page.locator('#next'));

  await page.waitForSelector('.shotrow');
  const cams = await page.$$eval('.shotrow input[type=file]', (ins) => ins.map((i) => i.getAttribute('capture')));
  if (cams.some((c) => c !== 'environment')) fail(`[${vp.name}] photo input does not open rear camera`);
  for (const k of ['area', 'access', 'clear', 'measure', 'pins', 'sock', 'injected', 'reinstated']) {
    await page.locator(`.shotrow input[data-k=${k}][accept="image/*"]`).setInputFiles({ name: `${k}.png`, mimeType: 'image/png', buffer: PNG });
  }
  await page.waitForFunction(() => document.querySelectorAll('.shot img').length === 8);
  await audit(page, vp, '06-capture-photos');
  await tap(page.locator('#next'));
  await page.waitForSelector('.list');
  await audit(page, vp, '07-capture-check');
  const n0 = await page.evaluate(() => JSON.parse(localStorage.getItem('injectatrace.v2')).pins.length);
  await tap(page.locator('#next'));
  await page.waitForSelector('text=recorded');
  const n1 = await page.evaluate(() => JSON.parse(localStorage.getItem('injectatrace.v2')).pins.length);
  if (n1 !== n0 + 1) fail(`[${vp.name}] hold point not saved`);
  await audit(page, vp, '08-capture-saved');

  // Daily checks.
  await go('daily?site=s1', '[data-open=am]');
  await audit(page, vp, '09-daily');
  await tap(page.locator('[data-open=am]'));
  await page.waitForSelector('.sheet.open');
  await page.waitForTimeout(300);
  await audit(page, vp, '10-daily-temps');
  await tap(page.locator('.sheet [data-primary]'));
  await page.waitForSelector('.sheet', { state: 'detached' });
  const am = await page.evaluate(() => JSON.parse(localStorage.getItem('injectatrace.v2')).days.find((d) => d.siteId === 's1' && d.date === new Date().toISOString().slice(0, 10))?.am);
  if (!am || am.ambient == null) fail(`[${vp.name}] AM temps not saved`);

  await go('records', '.tabs');
  await audit(page, vp, '11-records');

  // ---------- Back office ----------
  await tap(page.locator('#signout'));
  await signIn(page, 'office');
  await page.waitForSelector('.chart svg');
  if (vp.width < 768 && await page.$eval('.kpis', (k) => getComputedStyle(k).gridTemplateColumns.split(' ').length) !== 2) fail(`[${vp.name}] KPIs not 2-up on phone`);
  await audit(page, vp, '12-office-dashboard');
  await tap(page.locator('.chart .hit').nth(6));
  if (!(await page.locator('.tip').isVisible())) fail(`[${vp.name}] chart tap shows no value`);

  await go('sites', '.rtable');
  if (vp.width < 768) {
    if (await page.$eval('.rtable tr', (tr) => getComputedStyle(tr).display) !== 'grid') fail(`[${vp.name}] sites not shown as cards`);
    if (await page.$eval('.rtable td.key .num', (n) => parseFloat(getComputedStyle(n).fontSize)) < 30) fail(`[${vp.name}] key figure not large`);
  }
  await audit(page, vp, '13-office-sites');
  await tap(page.locator('#filters'));
  await page.waitForSelector('.sheet.open');
  await page.waitForTimeout(300);
  const sh = await page.locator('.sheet').boundingBox();
  if (Math.abs(sh.y + sh.height - vp.height) > 1) fail(`[${vp.name}] filter sheet not anchored to bottom`);
  await audit(page, vp, '14-office-filter-sheet');
  await tap(page.locator('.sheet [data-close]'));
  await page.waitForSelector('.sheet', { state: 'detached' });

  for (const t of ['overview', 'pins', 'daily', 'docs', 'team']) {
    await go(`sites/s1/${t}`, '.tabs');
    await page.waitForTimeout(150);
    await audit(page, vp, `15-site-${t}`);
  }

  // QA: newest pin is pending; pass it and it turns green.
  await go('qa', 'h1');
  await audit(page, vp, '16-office-qa');
  const newest = await page.evaluate(() => JSON.parse(localStorage.getItem('injectatrace.v2')).pins.at(-1).id);
  await go(`pin/${newest}`, '#pass');
  await audit(page, vp, '17-office-pin');
  await tap(page.locator('#pass'));
  await page.waitForTimeout(200);
  const qa = await page.evaluate((id) => JSON.parse(localStorage.getItem('injectatrace.v2')).pins.find((p) => p.id === id).qa, newest);
  if (qa !== 'approved') fail(`[${vp.name}] QA pass did not turn pin green`);

  await go('company', '#addop');
  await audit(page, vp, '18-office-company');

  // ---------- Client: read-only, no pail quantities, rates or costs ----------
  await tap(page.locator('#signout'));
  await signIn(page, 'client');
  await go(`pin/${newest}`, '.list');
  const txt = await page.locator('main').innerText();
  if (/Pails used|Materials cost|£/.test(txt)) fail(`[${vp.name}] client can see pail qty or costs`);
  if (await page.locator('#pass').count()) fail(`[${vp.name}] client can QA`);
  await audit(page, vp, '19-client-pin');
  await go('sites/s1/daily', '.tabs');
  if (/£/.test(await page.locator('main').innerText())) fail(`[${vp.name}] client can see costs`);
  if (await page.locator('a[href$="/team"]').count()) fail(`[${vp.name}] client can see team rates`);
  await audit(page, vp, '20-client-daily');

  await ctx.close();
}

await mkdir(OUT, { recursive: true });
const server = await serve(PORT);
const browser = await chromium.launch();
try {
  for (const vp of VIEWPORTS) await run(browser, vp);
} catch (e) {
  fail(`crashed: ${e.message.split('\n')[0]}`);
} finally {
  await browser.close();
  server.close();
}
console.log(failures.length ? `\n${failures.length} failure(s)` : '\nAll checks passed');
process.exit(failures.length ? 1 : 0);
