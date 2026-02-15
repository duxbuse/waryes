/**
 * Runtime configuration template
 * This file is processed by docker-entrypoint.sh at container startup
 * Environment variables are injected using envsubst
 */
window.APP_CONFIG = {
  API_URL: '__VITE_API_URL__',
  WS_URL: '__VITE_WS_URL__',
};
