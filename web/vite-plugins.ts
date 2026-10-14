import type { Plugin } from 'vite';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';
import { brand } from './src/config/brand';

const brotli = promisify(brotliCompress);
const gz = promisify(gzip);

const escapeAttr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// Writes the title, description, icons and social-card tags into index.html from brand.ts,
// so the name lives in one place. The OG image and URL must be absolute for scrapers: set
// VITE_SITE_URL (story 7.x does, on Render). Without it they stay relative, with a warning.
export function brandHtml(siteUrl: string | undefined): Plugin {
  const base = siteUrl?.replace(/\/+$/, '') ?? '';
  const abs = (p: string) => `${base}${p}`;
  let warned = false;

  return {
    name: 'brand-html',
    transformIndexHtml(_html, ctx) {
      if (!base && !warned) {
        warned = true;
        console.warn('[brand-html] VITE_SITE_URL is not set: og:image / og:url will be relative paths.');
      }
      const title = `${brand.name} — ${brand.tagline}`;
      const meta = (attrs: Record<string, string>) => ({ tag: 'meta', attrs, injectTo: 'head' as const });
      const link = (attrs: Record<string, string>) => ({ tag: 'link', attrs, injectTo: 'head' as const });
      // The body font is only discovered once the CSS is parsed; preloading the Latin subset
      // removes the late font swap that moves the largest paint on a throttled phone.
      const inter = Object.keys(ctx.bundle ?? {}).find((name) => /inter-latin-wght-normal-.*\.woff2$/.test(name));
      return [
        ...(inter
          ? [link({ rel: 'preload', as: 'font', type: 'font/woff2', href: `/${inter}`, crossorigin: '' })]
          : []),
        { tag: 'title', children: escapeAttr(title), injectTo: 'head' as const },
        meta({ name: 'description', content: brand.description }),
        meta({ name: 'theme-color', content: brand.themeColor }),
        link({ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }),
        link({ rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' }),
        link({ rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }),
        meta({ property: 'og:type', content: 'website' }),
        meta({ property: 'og:site_name', content: brand.name }),
        meta({ property: 'og:title', content: title }),
        meta({ property: 'og:description', content: brand.description }),
        meta({ property: 'og:image', content: abs('/og-image.png') }),
        meta({ property: 'og:image:width', content: '1200' }),
        meta({ property: 'og:image:height', content: '630' }),
        ...(base ? [meta({ property: 'og:url', content: base })] : []),
        meta({ name: 'twitter:card', content: 'summary_large_image' }),
        meta({ name: 'twitter:title', content: title }),
        meta({ name: 'twitter:description', content: brand.description }),
        meta({ name: 'twitter:image', content: abs('/og-image.png') }),
      ];
    },
  };
}

const COMPRESSIBLE = /\.(?:js|css|html|svg|json|txt|xml|webmanifest)$/;

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

// Writes `<file>.br` and `<file>.gz` next to every text asset in the build output. The server
// (src/lib/web-app.ts) serves them by Accept-Encoding, so nothing is compressed per request.
export function precompress(): Plugin {
  let outDir = 'dist';
  return {
    name: 'precompress',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      for await (const file of walk(outDir)) {
        if (!COMPRESSIBLE.test(file)) continue;
        const source = await readFile(file);
        const [br, gzipped] = await Promise.all([
          brotli(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: source.length } }),
          gz(source, { level: 9 }),
        ]);
        await Promise.all([writeFile(`${file}.br`, br), writeFile(`${file}.gz`, gzipped)]);
      }
    },
  };
}
