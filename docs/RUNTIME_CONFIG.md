# Runtime Configuration

This document explains the runtime configuration system for the Stellar Siege web client.

## Overview

The web client uses **runtime configuration** instead of build-time environment variables. This allows you to change API and WebSocket URLs without rebuilding the Docker image.

## How It Works

### Development Mode

When running `bun run dev`, the app loads configuration from `web/public/config.js`:

```javascript
window.APP_CONFIG = {
  API_URL: 'http://localhost:3001',
  WS_URL: 'ws://localhost:3001',
};
```

You can modify this file directly for local development.

### Production Mode (Docker)

1. **Build Phase**: The Docker image is built without any environment variables baked in
2. **Runtime Phase**: When the container starts:
   - `docker-entrypoint.sh` reads `VITE_API_URL` and `VITE_WS_URL` environment variables
   - Uses `envsubst` to replace placeholders in `config.template.js`
   - Generates `config.js` with actual values
   - Nginx serves the generated `config.js`

### Configuration Priority

The app reads configuration in this order:

1. **Runtime**: `window.APP_CONFIG` (from `config.js`)
2. **Build-time**: `import.meta.env.VITE_*` (Vite env vars)
3. **Defaults**: Hard-coded fallbacks (`http://localhost:3001`)

## Usage

### Docker Compose

Set environment variables in your `.env` file:

```bash
VITE_API_URL=https://api.yourdomain.com
VITE_WS_URL=wss://api.yourdomain.com
```

Then start the container:

```bash
docker-compose up game-client
```

### Docker Run

Pass environment variables directly:

```bash
docker run -p 8080:80 \
  -e VITE_API_URL=https://api.yourdomain.com \
  -e VITE_WS_URL=wss://api.yourdomain.com \
  duxbuse/stellar-siege-client:latest
```

### Kubernetes

Use ConfigMap or environment variables in your deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: stellar-siege-client
spec:
  template:
    spec:
      containers:
      - name: client
        image: duxbuse/stellar-siege-client:latest
        env:
        - name: VITE_API_URL
          value: "https://api.yourdomain.com"
        - name: VITE_WS_URL
          value: "wss://api.yourdomain.com"
```

## Files

- **`web/public/config.template.js`** - Template with placeholders (`__VITE_API_URL__`, `__VITE_WS_URL__`)
- **`web/public/config.js`** - Generated config (development default, gitignored)
- **`web/docker-entrypoint.sh`** - Script that generates config at container startup
- **`web/src/config.ts`** - TypeScript module that reads `window.APP_CONFIG`
- **`web/src/config.d.ts`** - TypeScript type definitions for `window.APP_CONFIG`
- **`web/index.html`** - Loads `config.js` before main app

## Code Usage

Import configuration values in your TypeScript code:

```typescript
import { API_URL, WS_URL } from '../config';

// Use the values
const ws = new WebSocket(WS_URL);
fetch(`${API_URL}/api/endpoint`);
```

## Migration Notes

### Before (Build-time)

```typescript
// Old approach - values baked in at build time
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
```

**Problem**: Requires rebuilding Docker image to change URLs

### After (Runtime)

```typescript
// New approach - values injected at container startup
import { API_URL } from '../config';
```

**Benefit**: Change URLs by restarting container with new environment variables

## Default Values

If environment variables are not provided, the system uses these defaults:

- `VITE_API_URL`: `http://localhost:3001`
- `VITE_WS_URL`: `ws://localhost:3001`

## Security

- In production builds (`import.meta.env.PROD`), the system enforces HTTPS for API URLs
- The console will log an error if `API_URL` doesn't start with `https://` in production

## Troubleshooting

### Config not loading in browser

1. Check browser console for config loading messages
2. Verify `config.js` is accessible: `http://localhost:8080/config.js`
3. Check that `window.APP_CONFIG` exists in browser console

### Wrong URLs in production

1. Check container logs for "Generating runtime config" message
2. Verify environment variables are set: `docker exec <container> env | grep VITE`
3. Check generated config: `docker exec <container> cat /usr/share/nginx/html/config.js`

### Template placeholders visible in browser

This means `envsubst` didn't run or failed. Check:
1. Container logs for errors
2. Entrypoint script permissions: `ls -l /docker-entrypoint.sh`
3. `gettext` package is installed in Docker image

## Testing

Test the configuration system:

```bash
# Start container with custom URLs
docker run -p 8080:80 \
  -e VITE_API_URL=https://test-api.example.com \
  -e VITE_WS_URL=wss://test-api.example.com \
  duxbuse/stellar-siege-client:latest

# Check generated config
docker exec <container> cat /usr/share/nginx/html/config.js

# Should output:
# window.APP_CONFIG = {
#   API_URL: 'https://test-api.example.com',
#   WS_URL: 'wss://test-api.example.com',
# };
```

## Benefits

1. **Single Build, Multiple Deployments**: Build once, deploy to dev/staging/prod with different configs
2. **No Rebuild Required**: Change URLs by restarting container
3. **GitOps Friendly**: Environment variables can be managed via CI/CD
4. **12-Factor App**: Follows the twelve-factor app methodology
5. **Development Flexibility**: Easy to override locally without Docker
