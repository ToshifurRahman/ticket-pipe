import { setupServer } from 'msw/node';

// Per-test handlers are added with server.use(...). Later stories register their endpoints.
export const server = setupServer();
