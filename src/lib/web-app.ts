import express, { type Express, type Request, type Response } from 'express';
import { existsSync } from 'fs';
import path from 'path';
import { logger } from './logger.js';

const NON_APP_PATH = /^\/(api|health|socket\.io)(\/|$)/;

// Serves the built React app with an SPA fallback. Mounted only when the build exists, so
// the API, the worker and the backend tests never depend on `bun run build` having run.
export function mountWebApp(app: Express, distDir: string): boolean {
  const indexFile = path.join(distDir, 'index.html');
  if (!existsSync(indexFile)) {
    logger.warn({ distDir }, 'web/dist not built; run `bun run build`, or use the Vite dev server (bun run web:dev)');
    return false;
  }

  app.use(express.static(distDir, { index: false }));
  app.get('*', (req: Request, res: Response, next) => {
    if (NON_APP_PATH.test(req.path) || !req.accepts('html')) {
      next();
      return;
    }
    res.sendFile(indexFile);
  });
  return true;
}

// Unknown API paths answer with JSON, never with the app shell.
export function apiNotFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not found' });
}
