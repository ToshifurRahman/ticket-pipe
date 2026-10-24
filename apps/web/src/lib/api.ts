import type { FieldErrors } from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  /** Field-level messages from a 400, or null when the body has no `errors` map. */
  get fieldErrors(): FieldErrors | null {
    const errors = (this.body as { errors?: unknown } | null)?.errors;
    return errors && typeof errors === 'object' ? (errors as FieldErrors) : null;
  }
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Same-origin only: the Vite proxy covers dev and Express covers production, so there is no
// base URL. `credentials` is explicit so the ops cookie session (6.5) needs no change here.
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');

  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const body = await readBody(res);
  if (!res.ok) {
    const message = (body as { error?: unknown } | null)?.error;
    throw new ApiError(res.status, body, typeof message === 'string' ? message : undefined);
  }
  return body as T;
}
