// Opt-ins are rate limited per client IP (5 an hour, kept in Redis, so it outlives a test
// run). Every e2e request comes from the same machine, so each opt-in presents its own address
// the way a proxy would. The API reads the last X-Forwarded-For hop.
export const freshIp = () => `10.${[1, 2, 3].map(() => Math.floor(Math.random() * 254) + 1).join('.')}`;
export const asClient = () => ({ 'x-forwarded-for': freshIp() });
