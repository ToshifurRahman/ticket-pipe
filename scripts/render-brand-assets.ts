import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { brand } from '../web/src/config/brand.js';
import { resolveToken } from './build-tokens.js';

// Renders the PNG favicons and the 1200x630 social card from web/public/favicon.svg,
// web/src/config/brand.ts and the carbon theme's tokens. Output is committed (web/public/),
// so builds never need a browser. Run after changing the brand: `bun run brand:assets`.

const publicDir = path.resolve(import.meta.dirname, '../web/public');
const fontsDir = path.resolve(import.meta.dirname, '../web/node_modules');
const font = async (file: string) => (await readFile(path.join(fontsDir, file))).toString('base64');

const [sans, label, mono] = await Promise.all([
  font('@fontsource-variable/public-sans/files/public-sans-latin-wght-normal.woff2'),
  font('@fontsource/archivo-narrow/files/archivo-narrow-latin-700-normal.woff2'),
  font('@fontsource/courier-prime/files/courier-prime-latin-400-normal.woff2'),
]);

const c = (dotted: string) => resolveToken('colors.json', dotted);
const color = {
  ground: c('semantic.surface.page'),
  ink: c('semantic.text.primary'),
  mute: c('semantic.text.secondary'),
  hair: c('semantic.border.default'),
  rule: c('semantic.border.strong'),
  received: c('semantic.ply.received'),
  receivedText: c('semantic.ply.received-text'),
  triaged: c('semantic.ply.triaged'),
  triagedText: c('semantic.ply.triaged-text'),
  live: c('semantic.ply.live'),
  liveText: c('semantic.ply.live-text'),
};

const svg = await readFile(path.join(publicDir, 'favicon.svg'), 'utf8');

// The bottom of the card is the ply row mid-pipeline: two stages done, Drafting live in form
// red, Replied still blank on the form.
const plies = [
  { n: '01', label: 'Received', bg: color.received, fg: color.receivedText },
  { n: '02', label: 'Triaged', bg: color.triaged, fg: color.triagedText },
  { n: '03', label: 'Drafting', bg: color.live, fg: color.liveText },
  { n: '04', label: 'Replied', bg: color.ground, fg: color.mute },
];

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
    @font-face { font-family: Sans; font-weight: 100 900; src: url(data:font/woff2;base64,${sans}) format('woff2'); }
    @font-face { font-family: Label; font-weight: 700; src: url(data:font/woff2;base64,${label}) format('woff2'); }
    @font-face { font-family: Mono; font-weight: 400; src: url(data:font/woff2;base64,${mono}) format('woff2'); }
    * { box-sizing: border-box; margin: 0; }
    body { width: 1200px; height: 630px; overflow: hidden; background: ${color.ground}; color: ${color.ink}; font-family: Sans, sans-serif; }
    .form { position: absolute; inset: 40px; border: 1px solid ${color.rule}; display: grid; grid-template-rows: 76px 1fr 112px; }
    .caps { font-family: Label, sans-serif; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
    .head { display: grid; grid-template-columns: 1fr 480px; border-bottom: 1px solid ${color.hair}; }
    .head > div { display: flex; align-items: center; padding: 0 28px; }
    .title { font-size: 24px; color: ${color.mute}; }
    .no { border-left: 1px solid ${color.hair}; gap: 14px; }
    .no .caps { font-size: 18px; color: ${color.mute}; }
    .ref { font-family: Mono, monospace; font-size: 22px; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .body { padding: 40px 28px; display: flex; flex-direction: column; justify-content: space-between; }
    .brand { display: flex; align-items: center; gap: 18px; }
    .brand svg { width: 56px; height: 56px; }
    .brand .caps { font-size: 40px; line-height: 1; }
    h1 { font-size: 62px; line-height: 1.08; font-weight: 600; letter-spacing: -0.02em; max-width: 960px; }
    .plies { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid ${color.hair}; }
    .ply { padding: 20px 24px; display: flex; flex-direction: column; justify-content: space-between; border-left: 1px solid ${color.hair}; }
    .ply:first-child { border-left: 0; }
    .ply .n { font-family: Mono, monospace; font-size: 20px; }
    .ply .caps { font-size: 26px; }
  </style></head><body><div class="form">
    <div class="head">
      <div class="caps title">Service ticket · Customer copy</div>
      <div class="no"><span class="caps">No.</span><span class="ref">TICK-1760000000000-7A4D2C9E</span></div>
    </div>
    <div class="body">
      <div class="brand">${svg}<span class="caps">${brand.name}</span></div>
      <h1>${brand.headline}</h1>
    </div>
    <div class="plies">${plies
      .map((p) => `<div class="ply" style="background:${p.bg};color:${p.fg}"><span class="n">${p.n}</span><span class="caps">${p.label}</span></div>`)
      .join('')}</div>
  </div></body></html>`);
  await card.evaluate('document.fonts.ready');
  await writeFile(path.join(publicDir, 'og-image.png'), await card.screenshot());
} finally {
  await browser.close();
}
console.log('Wrote favicon-32.png, apple-touch-icon.png, og-image.png to web/public/');
