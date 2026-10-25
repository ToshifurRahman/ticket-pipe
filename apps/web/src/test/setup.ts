import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { server } from './server';

// jsdom has no pointer capture; Sonner (and some Radix parts) call it on a click.
const pointerCaptureStubs = {
  setPointerCapture: () => {},
  releasePointerCapture: () => {},
  hasPointerCapture: () => false,
};
for (const [name, value] of Object.entries(pointerCaptureStubs)) {
  if (!(name in Element.prototype)) {
    Object.defineProperty(Element.prototype, name, { value, configurable: true, writable: true });
  }
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

afterEach(() => {
  server.resetHandlers();
  cleanup();
  document.documentElement.className = 'dark';
  document.documentElement.style.colorScheme = '';
});

afterAll(() => server.close());
