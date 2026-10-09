import type { Context, Env, Hono, Next } from 'hono';
import { getMimeType } from 'hono/utils/mime';
import { existsSync } from 'fs';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { logger } from './logger.js';

const NON_APP_PATH = /^\/(api|health|socket\.io)(\/|$)/;
const API_PATH = /^\/api(\/|$)/;

// Mirrors Express's `req.accepts('html')`: no Accept header, text/html, text/*, or */* all count.
function acceptsHtml(accept: string | undefined): boolean {
  if (!accept) return true;
  return accept.split(',').some((part) => {
    const type = part.split(';')[0]!.trim().toLowerCase();
    return type === 'text/html' || type === 'text/*' || type === '*/*';
  });
}

// Serves files from distDir. Plain fs, so the app is not tied to a runtime. Anything that is
// not an existing file under distDir falls through to the SPA fallback.
function staticFiles(distDir: string) {
  const root = path.resolve(distDir);
  return async (c: Context, next: Next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return next();
    try {
      const file = path.resolve(root, '.' + decodeURIComponent(c.req.path));
      if (!file.startsWith(root + path.sep) || !(await stat(file)).isFile()) return next();
      // Vite fingerprints everything under /assets/, so it can be cached forever.
      const cache = c.req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
      return new Response(c.req.method === 'HEAD' ? null : await readFile(file), {
        headers: { 'content-type': getMimeType(file) ?? 'application/octet-stream', 'cache-control': cache },
      });
    } catch {
      // Missing file, malformed URL escape, or a directory: let the fallback decide.
      return next();
    }
  };
}

// Unknown API paths answer with JSON, never with the app shell.
function notFoundHandler(indexFile: string | null) {
  return async (c: Context) => {
    if (API_PATH.test(c.req.path)) return c.json({ error: 'Not found' }, 404);
    const isRead = c.req.method === 'GET' || c.req.method === 'HEAD';
    if (indexFile && isRead && !NON_APP_PATH.test(c.req.path) && acceptsHtml(c.req.header('accept'))) {
      return c.html(await readFile(indexFile, 'utf8'));
    }
    return c.text('Not Found', 404);
  };
}

// Serves the built React app with an SPA fallback. The app shell is only served when the
// build exists, so the API, the worker and the backend tests never depend on
// `bun run build` having run. Either way the JSON 404 for unknown /api paths is installed.
export function mountWebApp<E extends Env>(app: Hono<E>, distDir: string): boolean {
  const indexFile = path.join(distDir, 'index.html');
  if (!existsSync(indexFile)) {
    logger.warn({ distDir }, 'web/dist not built; run `bun run build`, or use the Vite dev server (bun run web:dev)');
    app.notFound(notFoundHandler(null));
    return false;
  }

  app.use('*', staticFiles(distDir));
  app.notFound(notFoundHandler(indexFile));
  return true;
}
