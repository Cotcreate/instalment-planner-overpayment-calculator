// Renders the SVG app tiles to the PNG sizes browsers need for install.
// Usage: node scripts/make-icons.mjs
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const jobs = [
  ['icons/icon.svg', 'icons/icon-192.png', 192],
  ['icons/icon.svg', 'icons/icon-512.png', 512],
  ['icons/icon-maskable.svg', 'icons/icon-maskable-512.png', 512],
  ['icons/icon-maskable.svg', 'icons/apple-touch-icon.png', 180],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [src, out, size] of jobs) {
  const svg = await readFile(src, 'utf8');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}`);
  await page.screenshot({ path: out, omitBackground: true });
  console.log('wrote', out);
}
await browser.close();
