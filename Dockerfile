# Default command runs the API and the worker together (src/main.ts). To run them as two services,
# override the command: `bun src/index.ts` (API only) or `bun src/worker.ts` (worker only).
# A worker-only container has no HTTP server, so also pass `--no-healthcheck` to `docker run`.
#
# VITE_* values are baked into the web bundle at build time. Same recipe everywhere, three public
# build args: VITE_TURNSTILE_SITE_KEY (required), VITE_CF_ANALYTICS_TOKEN and VITE_SITE_URL.
FROM oven/bun:1.3.14 AS web
WORKDIR /app
ARG VITE_TURNSTILE_SITE_KEY
ARG VITE_CF_ANALYTICS_TOKEN
ARG VITE_SITE_URL
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile --ignore-scripts
COPY apps/web/ apps/web/
# Without a key the web app silently falls back to Cloudflare's always-pass test key.
RUN test -n "$VITE_TURNSTILE_SITE_KEY" \
  || { echo "VITE_TURNSTILE_SITE_KEY is required: docker build --build-arg VITE_TURNSTILE_SITE_KEY=..." >&2; exit 1; }
RUN bun --filter @ticket-pipe/web build

FROM oven/bun:1.3.14
WORKDIR /app
ENV NODE_ENV=production
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile --production --ignore-scripts --filter @ticket-pipe/api
COPY apps/api/src/ apps/api/src/
COPY apps/api/scripts/ apps/api/scripts/
COPY apps/api/migrations/ apps/api/migrations/
COPY --from=web /app/apps/web/dist apps/web/dist
WORKDIR /app/apps/api
USER bun
EXPOSE 3000
# The Bun image has no curl.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["bun", "-e", "const r = await fetch('http://localhost:' + (process.env.PORT ?? 3000) + '/health/live'); process.exit(r.ok ? 0 : 1)"]
CMD ["bun", "src/main.ts"]
