import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server';

// jsdom has no pointer capture; Sonner (and some Radix parts) call it on a click.
for (const method of ['setPointerCapture', 'releasePointerCapture'] as const) {
  Element.prototype[method] ??= () => {};
}
Element.prototype.hasPointerCapture ??= () => false;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

afterEach(() => {
  server.resetHandlers();
  cleanup();
  document.documentElement.className = 'dark';
  document.documentElement.style.colorScheme = '';
});

afterAll(() => server.close());
