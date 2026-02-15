#!/bin/sh
set -e

# Default values for environment variables
export VITE_API_URL="${VITE_API_URL:-http://localhost:3001}"
export VITE_WS_URL="${VITE_WS_URL:-ws://localhost:3001}"

echo "Generating runtime config with:"
echo "  VITE_API_URL=${VITE_API_URL}"
echo "  VITE_WS_URL=${VITE_WS_URL}"

# Replace placeholders in config.template.js and write to config.js
envsubst '__VITE_API_URL__ __VITE_WS_URL__' < /usr/share/nginx/html/config.template.js > /usr/share/nginx/html/config.js

echo "Runtime configuration generated successfully"

# Start nginx
exec nginx -g "daemon off;"
