FROM oven/bun:1.3-alpine AS base
WORKDIR /app

# Copy shared package first (dependency of server)
COPY shared/package.json shared/bun.lock* ./shared/
RUN cd shared && bun install --frozen-lockfile --production

COPY server/package.json server/bun.lock* ./server/
RUN cd server && bun install --frozen-lockfile

# Copy source
COPY shared/ ./shared/
COPY server/ ./server/

# Copy game data JSON files (needed by ServerDataLoader)
COPY web/src/data/ ./web/src/data/

WORKDIR /app/server

# Run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun --eval "fetch('http://localhost:3001/health').then(r=>process.exit(r.ok?0:1))" || exit 1

CMD ["bun", "start"]
