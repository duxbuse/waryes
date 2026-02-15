# Docker Deployment Guide

This guide explains how to deploy Stellar Siege using Docker Compose.

## Prerequisites

- [Docker](https://www.docker.com/get-started) installed
- [Docker Compose](https://docs.docker.com/compose/install/) installed
- At least 2GB of free RAM
- Ports 8080, 3001, 5432, and 6379 available

## Quick Start

### 1. Configure Environment Variables

Copy the example environment file and edit it with your secure passwords:

```bash
cp .env.example .env
```

Edit `.env` and configure the following:

**Required:**
- `POSTGRES_PASSWORD` - Database password (use a strong password)
- `REDIS_PASSWORD` - Redis password (use a strong password)
- `JWT_SECRET` - Authentication secret (generate with: `openssl rand -hex 32`)

**For Local Development (defaults are fine):**
- `VITE_API_URL=http://localhost:3001` - Backend API URL
- `VITE_WS_URL=ws://localhost:3001` - WebSocket URL
- `CLIENT_PORT=8080` - Port for web client
- `ALLOWED_ORIGIN=http://localhost:8080` - CORS origin

**For Cloud/Production Deployment:**
- `VITE_API_URL=https://api.yourdomain.com` - Your API domain (HTTPS)
- `VITE_WS_URL=wss://api.yourdomain.com` - Your WebSocket domain (WSS)
- `CLIENT_PORT=80` or `443` - Standard HTTP/HTTPS ports
- `ALLOWED_ORIGIN=https://yourdomain.com` - Your frontend domain
- `NODE_ENV=production` - Enable production optimizations

### 2. Start the Services

```bash
docker-compose up -d
```

This will:
1. Pull/build all required Docker images
2. Start PostgreSQL database
3. Start Redis cache
4. Start the game server (WebSocket)
5. Start the web client (nginx)

### 3. Access the Game

Open your browser and navigate to:
```
http://localhost:8080
```

The game should be ready to play!

## Services Overview

The Docker Compose setup includes 4 services:

### postgres
- **Image:** postgres:16-alpine
- **Port:** 5432 (localhost only)
- **Purpose:** Stores game state, player accounts, match history
- **Data:** Persisted in Docker volume `postgres_data`

### redis
- **Image:** redis:7-alpine
- **Port:** 6379 (localhost only)
- **Purpose:** Session management, caching, pub/sub for real-time features
- **Data:** Persisted in Docker volume `redis_data`

### game-server
- **Image:** duxbuse/stellar-siege-server:latest
- **Port:** 3001
- **Purpose:** WebSocket server for multiplayer game logic, lockstep synchronization
- **Depends on:** postgres, redis

### game-client
- **Image:** duxbuse/stellar-siege-client:latest
- **Port:** 8080
- **Purpose:** Web frontend (Three.js game client) served by nginx
- **Depends on:** game-server

## Common Commands

### View Service Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f game-client
docker-compose logs -f game-server
```

### Stop Services
```bash
# Stop but keep data
docker-compose stop

# Stop and remove containers (keeps volumes)
docker-compose down

# Stop and remove everything including data volumes
docker-compose down -v
```

### Restart Services
```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart game-client
```

### Rebuild After Code Changes
```bash
# Rebuild and restart
docker-compose up -d --build

# Rebuild specific service
docker-compose up -d --build game-client
```

### Check Service Status
```bash
docker-compose ps
```

### Execute Commands in Containers
```bash
# Access PostgreSQL
docker-compose exec postgres psql -U gameserver -d stellarsiege

# Access Redis CLI
docker-compose exec redis redis-cli -a YOUR_REDIS_PASSWORD

# Access game server shell
docker-compose exec game-server sh
```

## Troubleshooting

### Port Already in Use
If you get "port already allocated" errors:

```bash
# Check what's using the port (e.g., 8080)
# Windows:
netstat -ano | findstr :8080

# Linux/Mac:
lsof -i :8080

# Change the port in docker-compose.yml
# For example, change "8080:80" to "8081:80"
```

### Services Won't Start
```bash
# Check logs for errors
docker-compose logs

# Verify .env file exists and has valid values
cat .env

# Check Docker resources
docker system df
```

### Database Connection Errors
```bash
# Verify database is healthy
docker-compose ps postgres

# Check database logs
docker-compose logs postgres

# Reset database (WARNING: destroys data)
docker-compose down -v
docker-compose up -d
```

### Web Client Shows Blank Page
```bash
# Check nginx logs
docker-compose logs game-client

# Verify files were built
docker-compose exec game-client ls -la /usr/share/nginx/html

# Rebuild the client
docker-compose up -d --build game-client
```

### Connection to Game Server Fails
```bash
# Check game server logs
docker-compose logs game-server

# Verify ALLOWED_ORIGIN in .env matches your client URL
# Should be: ALLOWED_ORIGIN=http://localhost:8080

# Restart game server
docker-compose restart game-server
```

## Cloud Deployment

### Configuration for Cloud/Production

When deploying to a cloud provider (AWS, GCP, Azure, DigitalOcean, etc.), you need to configure the frontend to connect to your public domain instead of localhost.

#### Step 1: Set Up DNS

Point your domains to your server's IP address:
- `yourdomain.com` → Web client (port 80/443)
- `api.yourdomain.com` → Game server (port 3001)

Or use a single domain with reverse proxy (recommended).

#### Step 2: Configure Environment Variables

Edit your `.env` file with production values:

```bash
# Database & Cache (use strong passwords!)
POSTGRES_PASSWORD=strong_random_password_here
REDIS_PASSWORD=another_strong_password_here
JWT_SECRET=generated_with_openssl_rand_hex_32

# Frontend URLs (MUST use HTTPS/WSS in production)
VITE_API_URL=https://api.yourdomain.com
VITE_WS_URL=wss://api.yourdomain.com

# Client Configuration
CLIENT_PORT=80
NODE_ENV=production

# CORS - Your frontend domain
ALLOWED_ORIGIN=https://yourdomain.com
```

**Important:** The game client enforces HTTPS in production builds. You must use `https://` and `wss://` URLs, not `http://` or `ws://`.

#### Step 3: Set Up Reverse Proxy with SSL

Example nginx configuration:

```nginx
# /etc/nginx/sites-available/stellarsiege

# Web Client
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# API & WebSocket Server
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    # WebSocket upgrade support
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### Step 4: Get SSL Certificates

Use Let's Encrypt with Certbot:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d api.yourdomain.com
```

#### Step 5: Deploy

```bash
# Build with production environment variables
docker-compose build --no-cache

# Start services
docker-compose up -d

# Verify all services are healthy
docker-compose ps
```

#### Step 6: Verify

Test your deployment:
1. Visit `https://yourdomain.com` - Game client should load
2. Open browser console - Check for connection errors
3. Try creating a multiplayer lobby - WebSocket should connect
4. Check server logs: `docker-compose logs -f game-server`

### Multiple Origins (Optional)

If you need to support multiple frontend domains (e.g., `game.com` and `www.game.com`):

```bash
ALLOWED_ORIGIN=https://yourdomain.com,https://www.yourdomain.com
```

The game server will accept connections from any listed origin.

### Environment Variable Reference

| Variable | Description | Local Default | Production Example |
|----------|-------------|---------------|-------------------|
| `VITE_API_URL` | Backend HTTP API endpoint | `http://localhost:3001` | `https://api.yourdomain.com` |
| `VITE_WS_URL` | Backend WebSocket endpoint | `ws://localhost:3001` | `wss://api.yourdomain.com` |
| `CLIENT_PORT` | Port to expose web client | `8080` | `80` or `443` |
| `ALLOWED_ORIGIN` | CORS allowed origins | `http://localhost:8080` | `https://yourdomain.com` |
| `NODE_ENV` | Environment mode | `development` | `production` |
| `POSTGRES_PASSWORD` | Database password | - | Strong random password |
| `REDIS_PASSWORD` | Redis password | - | Strong random password |
| `JWT_SECRET` | Auth token secret | - | Generate with `openssl rand -hex 32` |
| `MAX_CONCURRENT_GAMES` | Max simultaneous games | `20` | Adjust based on server capacity |

## Production Best Practices

For production deployments, follow these guidelines:

1. **Use HTTPS/WSS** - Always use encrypted connections in production
2. **Reverse Proxy** - Use nginx/Traefik/Caddy for SSL termination and load balancing
3. **Strong Passwords** - Use randomly generated passwords (32+ characters)
4. **Firewall Rules** - Restrict database/Redis to localhost only
5. **Docker Secrets** - Use Docker secrets instead of environment variables for sensitive data
6. **Monitoring** - Set up Prometheus/Grafana or similar for observability
7. **Backups** - Automated PostgreSQL backups to S3/object storage
8. **Auto-restart** - Use `restart: always` in docker-compose.yml
9. **Resource Limits** - Set memory/CPU limits for containers
10. **Log Aggregation** - Send logs to centralized logging system

### Docker Compose Production Override

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  game-client:
    restart: always
    deploy:
      resources:
        limits:
          memory: 128M
        reservations:
          memory: 64M

  game-server:
    restart: always
    environment:
      NODE_ENV: production
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M

  postgres:
    restart: always
    deploy:
      resources:
        limits:
          memory: 256M
        reservations:
          memory: 128M

  redis:
    restart: always
    deploy:
      resources:
        limits:
          memory: 128M
        reservations:
          memory: 64M
```

Deploy with:
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Resource Usage

Expected resource consumption:
- **postgres:** ~50-100MB RAM
- **redis:** ~10-50MB RAM
- **game-server:** ~100-200MB RAM (scales with concurrent games)
- **game-client:** ~10-20MB RAM (nginx is lightweight)

**Total:** ~200-400MB RAM minimum

## Health Checks

All services have health checks configured:

```bash
# View health status
docker-compose ps

# Services should show "healthy" in the status column
```

## Updating

To update to the latest version:

```bash
# Pull latest images
docker-compose pull

# Restart with new images
docker-compose up -d
```

If using locally built images:

```bash
# Rebuild and restart
docker-compose up -d --build
```

## Development vs Production

The Docker Compose setup can be used for both:

**Development:**
- Set `NODE_ENV=development` in `.env`
- Use `docker-compose logs -f` to watch output
- Rebuild frequently with `--build` flag

**Production:**
- Set `NODE_ENV=production` in `.env`
- Use `restart: always` in docker-compose.yml
- Set up monitoring and backups
- Use a reverse proxy with SSL

## Network Architecture

```
Internet/LAN
    ↓
[Port 8080] → game-client (nginx) → Static files
    ↓
[Port 3001] → game-server (WebSocket)
    ↓           ↓
[Port 5432]   [Port 6379]
postgres      redis
(internal)    (internal)
```

Only ports 8080 (web) and 3001 (WebSocket) are exposed to the network.
Database and Redis are only accessible from within the Docker network.

## Data Persistence

Data is stored in Docker volumes:
- `postgres_data` - All game data, accounts, match history
- `redis_data` - Session data, cache (persisted to disk)

To backup data:
```bash
# Backup PostgreSQL
docker-compose exec postgres pg_dump -U gameserver stellarsiege > backup.sql

# Restore PostgreSQL
cat backup.sql | docker-compose exec -T postgres psql -U gameserver -d stellarsiege
```

## Support

For issues with Docker deployment:
1. Check logs: `docker-compose logs`
2. Verify .env configuration
3. Check port availability
4. Review [GitHub Issues](https://github.com/duxbuse/waryes/issues)
