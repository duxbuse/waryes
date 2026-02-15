# Stage 1: Build the application
FROM oven/bun:1 AS builder

# Build arguments for environment variables
ARG VITE_API_URL=http://localhost:3001
ARG VITE_WS_URL=ws://localhost:3001

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

# Set environment variables for build
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_WS_URL=${VITE_WS_URL}

# Build the application
WORKDIR /app/web
RUN bun run build

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy built files to nginx html directory
COPY --from=builder /app/web/dist /usr/share/nginx/html

# Copy nginx configuration
COPY web/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
