/**
 * CORS utility for handling multiple allowed origins
 */

// Support multiple origins separated by commas
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim());

/**
 * Check if an origin is in the allowed list
 */
export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

/**
 * Get CORS headers for a response
 * Returns the requesting origin if allowed, otherwise the first allowed origin
 */
export function getCorsHeaders(requestOrigin?: string | null): Record<string, string> {
  const origin = requestOrigin && isOriginAllowed(requestOrigin)
    ? requestOrigin
    : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

/**
 * Get the list of allowed origins (for logging/debugging)
 */
export function getAllowedOrigins(): string[] {
  return [...ALLOWED_ORIGINS];
}
