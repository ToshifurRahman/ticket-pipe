# API (default) and worker share one image: `docker run <image> bun src/worker.ts` runs the worker.
FROM oven/bun:1.3 AS web
WORKDIR /app/web
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile
COPY web/ ./
RUN bun run build

FROM oven/bun:1.3
WORKDIR /app
ENV NODE_ENV=production
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts
COPY src/ src/
COPY scripts/ scripts/
COPY migrations/ migrations/
COPY --from=web /app/web/dist web/dist
USER bun
EXPOSE 3000
CMD ["bun", "src/index.ts"]
