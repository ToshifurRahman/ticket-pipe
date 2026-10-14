import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { brand } from '../web/src/config/brand';

// Renders the PNG favicons and the 1200x630 social card from web/public/favicon.svg and
// web/src/config/brand.ts. Output is committed (web/public/), so builds never need a browser.
// Run after changing the brand: `bun run brand:assets`.

const publicDir = path.resolve(import.meta.dirname, '../web/public');
const fontFile = path.resolve(
  import.meta.dirname,
  '../web/node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
);

const svg = await readFile(path.join(publicDir, 'favicon.svg'), 'utf8');
const font = (await readFile(fontFile)).toString('base64');

const browser = await chromium.launch();
try {
  const iconPage = await browser.newPage({ viewport: { width: 180, height: 180 } });
  for (const [file, size] of [['favicon-32.png', 32], ['apple-touch-icon.png', 180]] as const) {
    await iconPage.setViewportSize({ width: size, height: size });
    await iconPage.setContent(
      `<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`,
    );
    await writeFile(path.join(publicDir, file), await iconPage.screenshot({ omitBackground: true }));
  }

  const card = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await card.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: Inter; font-weight: 100 900; src: url(data:font/woff2;base64,${font}) format('woff2'); }
    * { box-sizing: border-box; }
    body { margin: 0; width: 1200px; height: 630px; overflow: hidden; font-family: Inter, sans-serif; color: #fafafa;
      background: radial-gradient(900px 500px at 85% -10%, rgba(124,58,237,.55), transparent 60%), radial-gradient(700px 400px at 0% 110%, rgba(124,58,237,.3), transparent 60%), #0b0716; }
    .stars { position: absolute; inset: 0; background-image: radial-gradient(1.5px 1.5px at 20px 30px, #fff8, transparent), radial-gradient(1px 1px at 140px 90px, #fff6, transparent), radial-gradient(1.5px 1.5px at 260px 200px, #fff7, transparent); background-size: 300px 260px; opacity: .6; }
    .wrap { position: relative; padding: 72px 80px; height: 100%; display: flex; flex-direction: column; justify-content: space-between; }
    .brand { display: flex; align-items: center; gap: 20px; font-size: 44px; font-weight: 600; letter-spacing: -0.02em; }
    .brand svg { width: 72px; height: 72px; filter: drop-shadow(0 0 28px rgba(124,58,237,.7)); }
    h1 { margin: 0; font-size: 76px; line-height: 1.05; font-weight: 700; letter-spacing: -0.035em; max-width: 960px; }
    p { margin: 24px 0 0; font-size: 28px; color: #b9b3cc; }
  </style></head><body><div class="stars"></div><div class="wrap">
    <div class="brand">${svg}<span>${brand.name}</span></div>
    <div><h1>${brand.headline}</h1><p>${brand.tagline} &middot; ${brand.footer}</p></div>
  </div></body></html>`);
  await card.evaluate(() => document.fonts.ready);
  await writeFile(path.join(publicDir, 'og-image.png'), await card.screenshot());
} finally {
  await browser.close();
}
console.log('Wrote favicon-32.png, apple-touch-icon.png, og-image.png to web/public/');
