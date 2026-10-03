// The organization-wide ops feed. This deployment is a single tenant, so there is one room;
// a multi-tenant version would use `ops:<orgId>` here and at the publish site.
//
// Only src/services/ops-feed.ts may publish to this room (enforced by
// tests/ops-feed.guard.test.ts). Everything in it is visible to every ops subscriber.
export const OPS_ROOM = 'ops';
