// Mobile acceptance check: runs every screen at 375px and 390px wide (plus tablet and desktop),
// walks the full record flow with touch input, and fails on horizontal scroll or tap targets under 48px.
// Screenshots go to test-output/. Usage: npm test
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

const failures = [];
const fail = (msg) => { failures.push(msg); console.log('  FAIL', msg); };

// A tiny valid PNG to stand in for a camera shot.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');

async function audit(page, vp, label) {
  const res = await page.evaluate(() => {
    const doc = document.documentElement;
    const overflow = doc.scrollWidth - doc.clientWidth;
    const sel = [
      'a.btn', 'button', 'select', 'textarea', 'input[type=text]', '.choice span', '.bottomnav a',
      '.capture', 'label.toggle', '.rtable a.title',
    ].join(',');
    const small = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === 'hidden' || el.closest('[hidden]')) continue;
      // Inline title links sit in a card whose full-width "Open project" button is the real target.
      if (el.matches('.rtable a.title')) continue;
      if (r.width < 48 || r.height < 48) small.push(`${el.tagName.toLowerCase()}.${el.className || ''} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    const fontTooSmall = [...document.querySelectorAll('select, textarea, input[type=text]')]
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).length;
    return { overflow, small, fontTooSmall };
  });
  if (res.overflow > 0) fail(`[${vp.name}] ${label}: horizontal overflow ${res.overflow}px`);
  res.small.forEach((s) => fail(`[${vp.name}] ${label}: tap target under 48px: ${s}`));
  if (res.fontTooSmall) fail(`[${vp.name}] ${label}: ${res.fontTooSmall} inputs under 16px (iOS will zoom)`);
  await page.screenshot({ path: `${OUT}/${vp.name}-${label}.png`, fullPage: true });
  console.log(`  ok  ${label}`);
}

async function run(browser, vp) {
  console.log(`\n${vp.name} (${vp.width}x${vp.height})`);
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`[${vp.name}] JS error: ${e.message}`));
  const tap = async (locator) => (vp.mobile ? locator.tap() : locator.click());

  await page.goto(`${BASE}#/jobs`);
  await page.waitForSelector('.job');
  await audit(page, vp, '01-jobs');

  // Bottom nav must be fixed to the bottom and visible.
  const nav = await page.locator('.bottomnav').boundingBox();
  if (vp.width < 1024 && Math.abs(nav.y + nav.height - vp.height) > 1) fail(`[${vp.name}] bottom nav not pinned to bottom`);

  // ---- Record flow ----
  await tap(page.locator('.job .btn.primary').first());
  await page.waitForSelector('.progressbar');
  if (!(await page.locator('#next').isDisabled())) fail(`[${vp.name}] Next enabled before elevation chosen`);
  await tap(page.locator('label.choice').first());
  await audit(page, vp, '02-record-where');
  await tap(page.locator('#next'));

  await page.waitForSelector('.elev-view');
  await page.waitForTimeout(150);
  if (!(await page.locator('#next').isDisabled())) fail(`[${vp.name}] Next enabled before pin confirmed`);
  const view = page.locator('.elev-view');
  const box = await view.boundingBox();
  const scale0 = await page.$eval('.elev-stage', (s) => new DOMMatrix(getComputedStyle(s).transform).a);

  // Pinch out with two synthetic touch pointers.
  await page.$eval('.elev-view', (v) => {
    const r = v.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const ev = (type, id, x) => v.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: cy, bubbles: true, isPrimary: id === 11 }));
    ev('pointerdown', 11, cx - 30); ev('pointerdown', 12, cx + 30);
    for (let i = 1; i <= 10; i++) { ev('pointermove', 11, cx - 30 - i * 8); ev('pointermove', 12, cx + 30 + i * 8); }
    ev('pointerup', 11, cx - 110); ev('pointerup', 12, cx + 110);
  });
  const scale1 = await page.$eval('.elev-stage', (s) => new DOMMatrix(getComputedStyle(s).transform).a);
  if (!(scale1 > scale0 * 1.5)) fail(`[${vp.name}] pinch did not zoom (${scale0.toFixed(2)} -> ${scale1.toFixed(2)})`);
  if (await page.locator('.elev-confirm').isVisible()) fail(`[${vp.name}] pinch dropped a pin`);

  // Zoom button works.
  await tap(page.locator('[data-z=fit]'));
  await tap(page.locator('[data-z=in]'));
  const scale2 = await page.$eval('.elev-stage', (s) => new DOMMatrix(getComputedStyle(s).transform).a);
  if (!(scale2 > scale0)) fail(`[${vp.name}] + button did not zoom`);

  // Tap places a pending pin, which needs confirming.
  const tx = box.x + box.width * 0.45, ty = box.y + box.height * 0.4;
  if (vp.mobile) await page.touchscreen.tap(tx, ty); else await page.mouse.click(tx, ty);
  await page.waitForSelector('.elev-confirm:not([hidden])');
  if (await page.locator('.pin:not(.other)').count() !== 1) fail(`[${vp.name}] pending pin not shown`);
  if (!(await page.locator('#next').isDisabled())) fail(`[${vp.name}] Next enabled with unconfirmed pin`);
  await audit(page, vp, '03-record-pin-confirm');
  await tap(page.locator('[data-c=ok]'));
  await page.waitForFunction(() => document.querySelector('#pinstate').textContent.includes('Pinned'));
  await audit(page, vp, '04-record-pinned');
  await tap(page.locator('#next'));

  await page.waitForSelector('.stepper');
  await tap(page.locator('label.choice', { hasText: 'Penetration seal' }));
  await tap(page.locator('[data-q="0.5"]'));
  await tap(page.locator('label.choice', { hasText: 'Complete' }));
  if ((await page.locator('#qty').textContent()).trim() !== '1.5L') fail(`[${vp.name}] stepper value wrong`);
  await audit(page, vp, '05-record-work');
  await tap(page.locator('#next'));

  await page.waitForSelector('.capture');
  const capture = await page.$eval('.capture input', (i) => [i.accept, i.getAttribute('capture')]);
  if (capture[0] !== 'image/*' || capture[1] !== 'environment') fail(`[${vp.name}] photo input does not open rear camera`);
  await page.locator('.capture input[data-kind=Before]').setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForSelector('.shot img');
  await audit(page, vp, '06-record-photos');
  await tap(page.locator('#next'));

  await page.waitForSelector('.review');
  await audit(page, vp, '07-record-review');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('injectatrace.v1')).records.length);
  await tap(page.locator('#next'));
  await page.waitForSelector('text=Record saved');
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('injectatrace.v1')).records.length);
  if (after !== before + 1) fail(`[${vp.name}] record not saved`);
  await audit(page, vp, '08-record-saved');

  // ---- Log ----
  await tap(page.locator('.bottomnav a[data-tab=log]'));
  await page.waitForSelector('.entry');
  await page.waitForTimeout(100);
  await audit(page, vp, '09-log');

  // ---- Back office ----
  await tap(page.locator('.bottomnav a[data-tab=office]'));
  await page.waitForSelector('.chart svg');
  await page.waitForTimeout(100);
  const chartW = await page.$eval('.chart svg', (s) => s.getBoundingClientRect().width);
  const cardW = await page.$eval('.chart', (c) => c.clientWidth);
  if (Math.abs(chartW - cardW) > 1) fail(`[${vp.name}] chart not sized to container (${chartW} vs ${cardW})`);
  const minFont = await page.$$eval('.chart text', (t) => Math.min(...t.map((x) => x.getBoundingClientRect().height)));
  if (minFont < 11) fail(`[${vp.name}] chart text too small (${minFont}px)`);
  if (vp.width < 768) {
    const layout = await page.$eval('.rtable tr', (tr) => getComputedStyle(tr).display);
    if (layout !== 'grid') fail(`[${vp.name}] projects not shown as cards`);
    const big = await page.$eval('.rtable td.key .num', (n) => parseFloat(getComputedStyle(n).fontSize));
    if (big < 30) fail(`[${vp.name}] key figure not large on card (${big}px)`);
  }
  await audit(page, vp, '10-office');

  await tap(page.locator('.chart .hit').last());
  if (!(await page.locator('.tip').isVisible())) fail(`[${vp.name}] chart tap shows no value`);

  await tap(page.locator('#filters'));
  await page.waitForSelector('.sheet.open');
  await page.waitForTimeout(300);
  const sheet = await page.locator('.sheet').boundingBox();
  if (Math.abs(sheet.y + sheet.height - vp.height) > 1) fail(`[${vp.name}] filter sheet not anchored to bottom`);
  await audit(page, vp, '11-office-filters');
  await tap(page.locator('.sheet label.choice', { hasText: 'Complete' }));
  await tap(page.locator('.sheet [data-primary]'));
  await page.waitForSelector('.sheet', { state: 'detached' });
  if (!(await page.locator('#filters').textContent()).includes('(1)')) fail(`[${vp.name}] filter not applied`);

  await tap(page.locator('.rtable .go a').first());
  await page.waitForSelector('.elev-view');
  await page.waitForTimeout(150);
  await audit(page, vp, '12-project');

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
