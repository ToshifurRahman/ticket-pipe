import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
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
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
