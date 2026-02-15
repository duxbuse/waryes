# Cloud Deployment Checklist

## ⚠️ CRITICAL: Set Environment Variables BEFORE Building

The frontend URLs (`VITE_API_URL` and `VITE_WS_URL`) are **baked into the JavaScript at build time**. You MUST configure these before running `docker-compose build`.

## Quick Deploy Steps

### 1. Create/Update `.env` File

```bash
# Copy example if you don't have one
cp .env.example .env
```

Edit `.env` with your cloud/production values:

```bash
# Database & Cache (REQUIRED - use strong passwords!)
POSTGRES_PASSWORD=YOUR_STRONG_PASSWORD_HERE
REDIS_PASSWORD=YOUR_STRONG_PASSWORD_HERE
JWT_SECRET=GENERATE_WITH_openssl_rand_hex_32

# ⚠️ CRITICAL: Frontend URLs (where the client connects to backend)
# These MUST point to your cloud domain, not localhost!
VITE_API_URL=https://api.yourdomain.com
VITE_WS_URL=wss://api.yourdomain.com

# Backend CORS (where the backend accepts connections from)
# This should be your frontend domain
ALLOWED_ORIGIN=https://yourdomain.com

# Ports and Environment
CLIENT_PORT=80
NODE_ENV=production
MAX_CONCURRENT_GAMES=20
```

### 2. Verify Environment Variables

Before building, verify your `.env` file:

```bash
# Check that VITE_* variables are set correctly
cat .env | grep VITE_

# Should output something like:
# VITE_API_URL=https://api.yourdomain.com
# VITE_WS_URL=wss://api.yourdomain.com
```

### 3. Build Docker Images

**IMPORTANT:** Build with `--no-cache` to ensure environment variables are picked up:

```bash
docker-compose build --no-cache
```

This will:
1. Read environment variables from `.env`
2. Pass them as build args to the Dockerfile
3. Vite will replace `import.meta.env.VITE_*` with the actual URLs
4. The frontend is compiled with your cloud URLs hardcoded

### 4. Start Services

```bash
docker-compose up -d
```

### 5. Verify Deployment

```bash
# Check all services are running
docker-compose ps

# Check game-client logs
docker-compose logs game-client

# Check game-server logs
docker-compose logs game-server
```

### 6. Test in Browser

1. Open your browser to `https://yourdomain.com`
2. Open Developer Console (F12)
3. Try to create a multiplayer lobby
4. Check the Network tab - WebSocket connection should go to your domain, NOT localhost

**What to look for:**
```
✅ GOOD: WebSocket connecting to wss://api.yourdomain.com
❌ BAD:  WebSocket connecting to ws://localhost:3001
```

## Common Issues

### Issue: Frontend Still Connects to Localhost

**Cause:** Docker image was built before environment variables were set

**Solution:**
```bash
# 1. Update .env with correct URLs
# 2. Rebuild with no cache
docker-compose build --no-cache game-client
docker-compose up -d game-client
```

### Issue: CORS Errors in Browser

**Cause:** `ALLOWED_ORIGIN` doesn't match your frontend domain

**Solution:**
```bash
# Edit .env
ALLOWED_ORIGIN=https://yourdomain.com

# Restart game-server (no rebuild needed)
docker-compose restart game-server
```

### Issue: WebSocket Connection Fails

**Possible Causes:**
1. Reverse proxy not configured for WebSocket upgrade
2. SSL certificate issues (mixing HTTP/HTTPS)
3. Wrong URL in VITE_WS_URL

**Solution:**
- Verify reverse proxy has WebSocket support (see DOCKER.md)
- Ensure using `wss://` (not `ws://`) in production
- Check game-server logs: `docker-compose logs game-server`

## Environment Variables Quick Reference

| Variable | Example | Purpose |
|----------|---------|---------|
| `VITE_API_URL` | `https://api.yourdomain.com` | Frontend → Backend HTTP API |
| `VITE_WS_URL` | `wss://api.yourdomain.com` | Frontend → Backend WebSocket |
| `ALLOWED_ORIGIN` | `https://yourdomain.com` | Backend CORS whitelist |
| `CLIENT_PORT` | `80` or `443` | Port to expose web client |

## Debugging Tips

### Check What URLs Are Built Into Frontend

```bash
# After building, inspect the built JavaScript
docker-compose run --rm game-client sh -c "grep -r 'localhost:3001' /usr/share/nginx/html"

# Should return nothing if built correctly
# If it finds localhost, your build didn't pick up the env vars
```

### Check Environment Variables During Build

```bash
# Add this to web/Dockerfile temporarily to debug:
# RUN echo "VITE_API_URL=$VITE_API_URL" && echo "VITE_WS_URL=$VITE_WS_URL"

# Then rebuild and check output
docker-compose build game-client
```

### Force Clean Rebuild

```bash
# Nuclear option - rebuild everything from scratch
docker-compose down
docker system prune -a --volumes  # WARNING: Deletes all Docker data
docker-compose build --no-cache
docker-compose up -d
```

## Production Readiness Checklist

Before going live:

- [ ] `.env` file configured with production values
- [ ] `VITE_API_URL` points to your API domain (HTTPS)
- [ ] `VITE_WS_URL` points to your WebSocket domain (WSS)
- [ ] `ALLOWED_ORIGIN` set to your frontend domain
- [ ] Strong passwords for `POSTGRES_PASSWORD` and `REDIS_PASSWORD`
- [ ] `JWT_SECRET` generated with `openssl rand -hex 32`
- [ ] DNS configured for your domains
- [ ] SSL certificates installed (Let's Encrypt recommended)
- [ ] Reverse proxy configured (nginx/Traefik/Caddy)
- [ ] Docker images built with `--no-cache`
- [ ] Services started and healthy
- [ ] Browser console shows no localhost connections
- [ ] WebSocket connects successfully
- [ ] Multiplayer lobby creation works
- [ ] No CORS errors in browser console

## Support

If you're still having issues:
1. Check `DOCKER.md` for detailed deployment guide
2. Verify environment variables are set: `docker-compose config`
3. Check service logs: `docker-compose logs -f`
4. Open GitHub issue with logs and configuration

## TL;DR - Minimum Steps

```bash
# 1. Configure environment
cp .env.example .env
nano .env  # Set VITE_API_URL, VITE_WS_URL, ALLOWED_ORIGIN to your domains

# 2. Build with environment variables
docker-compose build --no-cache

# 3. Deploy
docker-compose up -d

# 4. Verify
docker-compose ps
docker-compose logs game-client
# Open browser, check WebSocket connects to your domain (not localhost)
```
