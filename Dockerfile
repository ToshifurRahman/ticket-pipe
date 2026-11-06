# Default command runs the API and the worker together (src/main.ts). To run them as two services,
# override the command: `bun src/index.ts` (API only) or `bun src/worker.ts` (worker only).
FROM oven/bun:1.3 AS web
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile --ignore-scripts
COPY apps/web/ apps/web/
RUN bun --filter @ticket-pipe/web build

FROM oven/bun:1.3
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
CMD ["bun", "src/main.ts"]
