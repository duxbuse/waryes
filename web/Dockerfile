# Stage 1: Build the application
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files for both shared and web
COPY shared/package.json shared/bun.lock /app/shared/
COPY web/package.json web/bun.lock /app/web/

# Install shared dependencies first (including peer deps)
WORKDIR /app/shared
RUN bun install

# Install web dependencies (which includes three)
WORKDIR /app/web
RUN bun install --frozen-lockfile

# Copy all source code
COPY shared/ /app/shared/
COPY web/ /app/web/

# Build the application (no build-time env vars needed - runtime config is used)
WORKDIR /app/web
RUN bun run build

# Stage 2: Serve with nginx
FROM nginx:alpine

# Install gettext for envsubst
RUN apk add --no-cache gettext

# Copy built files to nginx html directory
COPY --from=builder /app/web/dist /usr/share/nginx/html

# Copy config template (will be processed at runtime)
COPY web/public/config.template.js /usr/share/nginx/html/config.template.js

# Copy nginx configuration
COPY web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy entrypoint script
COPY web/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose port 80
EXPOSE 80

# Use custom entrypoint that generates runtime config
ENTRYPOINT ["/docker-entrypoint.sh"]
