// Behind Render's proxy the caller's address is the last hop it appended to X-Forwarded-For;
// earlier hops are client-supplied. Locally there is no proxy and the header is absent.
export function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  const hops = (c.req.header('x-forwarded-for') ?? '').split(',').map((hop) => hop.trim()).filter(Boolean);
  return hops.at(-1) ?? 'local';
}
