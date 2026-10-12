import type { Hono } from 'hono';

export interface TestResponse {
  status: number;
  body: any;
  text: string;
  headers: Record<string, string>;
}

// A deliberately tiny stand-in for supertest's builder, over Hono's in-process
// `app.request()`: no port is opened, and tests keep reading `res.status` / `res.body`.
class TestRequest implements PromiseLike<TestResponse> {
  private headers: Record<string, string> = {};
  private params = new URLSearchParams();
  private payload: unknown;

  constructor(
    private readonly app: Hono<any>,
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

  private async exec(): Promise<TestResponse> {
    const qs = this.params.toString();
    const url = qs ? `${this.path}${this.path.includes('?') ? '&' : '?'}${qs}` : this.path;
    const init: RequestInit = { method: this.method, headers: { ...(await this.defaults?.()), ...this.headers } };
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
      body: isJson && text ? JSON.parse(text) : {},
      headers: Object.fromEntries(res.headers),
    };
  }

  then<R1 = TestResponse, R2 = never>(
    onfulfilled?: ((value: TestResponse) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return this.exec().then(onfulfilled, onrejected);
  }
}

export default function request(app: Hono<any>, defaults?: () => Promise<Record<string, string>>) {
  return {
    get: (path: string) => new TestRequest(app, 'GET', path, defaults),
    post: (path: string) => new TestRequest(app, 'POST', path, defaults),
    put: (path: string) => new TestRequest(app, 'PUT', path, defaults),
    delete: (path: string) => new TestRequest(app, 'DELETE', path, defaults),
  };
}
