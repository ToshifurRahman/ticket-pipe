import type { Hono } from 'hono';

/** Any Hono app, whatever its env: the helper only calls `request`. */
export type TestApp = Pick<Hono, 'request'>;

export interface TestResponse<T = unknown> {
  status: number;
  body: T;
  text: string;
  headers: Record<string, string>;
}

// A deliberately tiny stand-in for supertest's builder, over Hono's in-process
// `app.request()`: no port is opened, and tests keep reading `res.status` / `res.body`.
class TestRequest<T> implements PromiseLike<TestResponse<T>> {
  private headers: Record<string, string> = {};
  private params = new URLSearchParams();
  private payload: unknown;

  constructor(
    private readonly app: TestApp,
    private readonly method: string,
    private readonly path: string,
    private readonly defaults?: () => Promise<Record<string, string>>
  ) {}

  set(name: string, value: string): this {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  query(params: Record<string, unknown>): this {
    for (const [key, value] of Object.entries(params)) this.params.append(key, String(value));
    return this;
  }

  send(payload: unknown): this {
    this.payload = payload;
    return this;
  }

  private async exec(): Promise<TestResponse<T>> {
    const qs = this.params.toString();
    const url = qs ? `${this.path}${this.path.includes('?') ? '&' : '?'}${qs}` : this.path;
    const init: RequestInit = {
      method: this.method,
      headers: { ...(await this.defaults?.()), ...this.headers },
    };
    if (this.payload !== undefined) {
      const headers = init.headers as Record<string, string>;
      if (typeof this.payload === 'string') {
        init.body = this.payload;
      } else {
        init.body = JSON.stringify(this.payload);
        headers['content-type'] ??= 'application/json';
      }
    }
    const res = await this.app.request(url, init);
    const text = await res.text();
    const isJson = (res.headers.get('content-type') ?? '').includes('json');
    return {
      status: res.status,
      text,
      body: (isJson && text ? JSON.parse(text) : {}) as T,
      headers: Object.fromEntries(res.headers),
    };
  }

  then<R1 = TestResponse<T>, R2 = never>(
    onfulfilled?: ((value: TestResponse<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return this.exec().then(onfulfilled, onrejected);
  }
}

export default function request(app: TestApp, defaults?: () => Promise<Record<string, string>>) {
  return {
    get: <T = unknown>(path: string) => new TestRequest<T>(app, 'GET', path, defaults),
    post: <T = unknown>(path: string) => new TestRequest<T>(app, 'POST', path, defaults),
    put: <T = unknown>(path: string) => new TestRequest<T>(app, 'PUT', path, defaults),
    delete: <T = unknown>(path: string) => new TestRequest<T>(app, 'DELETE', path, defaults),
  };
}
