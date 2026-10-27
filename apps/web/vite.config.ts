import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

import { brandHtml, precompress } from './vite-plugins';

const API = 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss(), brandHtml(process.env.VITE_SITE_URL), precompress()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    port: 5173,
    proxy: {
      '/api': API,
      '/health': API,
      '/socket.io': { target: API, ws: true },
    },
  },
  // `ui` renders components in jsdom; `guards` read source files and tokens from disk in Node.
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'ui',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./src/test/setup.ts'],
          css: false,
        },
      },
      {
        extends: true,
        test: { name: 'guards', include: ['tests/**/*.test.ts'], environment: 'node' },
      },
    ],
  },
});
