/**
 * Auth middleware for protecting HTTP endpoints
 */

import { verifyToken, type TokenPayload } from './jwt';

export interface AuthenticatedRequest {
  player: TokenPayload;
}

/**
 * Extract and verify JWT from Authorization header.
 * Returns the token payload or null if invalid/missing.
 */
export async function authenticateRequest(req: Request): Promise<TokenPayload | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyToken(token);
    if (payload.type !== 'access') {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Returns 401 response for unauthenticated requests
 */
export function unauthorizedResponse(message: string = 'Unauthorized'): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
