import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { debug, info } = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn() }));

vi.mock('../../../src/lib/logger.js', () => ({ logger: { debug, info } }));

import { type AppEnv, requestLogger } from '../../../src/middleware/request-logger.js';

const app = new Hono<AppEnv>();
app.use('*', requestLogger);
app.all('*', (c) => c.text('ok'));

beforeEach(() => {
  debug.mockReset();
  info.mockReset();
});

describe('request logger levels', () => {
  it.each(['/health', '/health/live', '/health/ready'])('logs %s at debug', async (path) => {
    const res = await app.request(path);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(debug).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledWith(expect.objectContaining({ path, status: 200 }), 'request');
    expect(info).not.toHaveBeenCalled();
  });

  it.each(['/healthy', '/health-check', '/api/x'])('logs %s at info', async (path) => {
    const res = await app.request(path);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ path, status: 200 }), 'request');
    expect(debug).not.toHaveBeenCalled();
  });

  it("echoes the caller's x-request-id", async () => {
    const res = await app.request('/health/live', { headers: { 'x-request-id': 'abc-123' } });
    expect(res.headers.get('x-request-id')).toBe('abc-123');
    expect(debug).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'abc-123' }),
      'request'
    );
  });
});
