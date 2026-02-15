/**
 * Auth API routes
 */

import { authService } from '../services/AuthService';
import { authenticateRequest, unauthorizedResponse } from '../auth/middleware';
import { registerSchema, loginSchema, refreshSchema } from '../validation/schemas';
import type { RateLimiter } from '../RateLimiter';
import { getCorsHeaders } from '../utils/cors';

export function createAuthRouter(rateLimiter: RateLimiter) {
  return async function handleAuthRoute(req: Request, path: string): Promise<Response> {
    const origin = req.headers.get('origin');

    // Response helpers with CORS headers
    const json = (data: unknown, status: number = 200): Response => {
      return new Response(JSON.stringify(data), {
        status,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin),
        },
      });
    };

    const badRequest = (message: string): Response => json({ error: message }, 400);
    const unauthorized = (message: string): Response => json({ error: message }, 401);
    const notFound = (message: string): Response => json({ error: message }, 404);
    const conflict = (message: string): Response => json({ error: message }, 409);
    const methodNotAllowed = (): Response => json({ error: 'Method not allowed' }, 405);
    const tooManyRequests = (retryAfter: number): Response => {
      return new Response(JSON.stringify({ error: 'Too many requests', retryAfter }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil(retryAfter / 1000)),
          ...getCorsHeaders(origin),
        },
      });
    };
    // Use last entry in x-forwarded-for (closest proxy), or fall back to 'unknown'
    const xff = req.headers.get('x-forwarded-for');
    const clientIp = xff ? xff.split(',').pop()!.trim() : 'unknown';

    switch (path) {
      case '/api/auth/register': {
        if (req.method !== 'POST') return methodNotAllowed();

        // Rate limit: 3/hour per IP
        if (!rateLimiter.tryConsume(`register:${clientIp}`)) {
          return tooManyRequests(rateLimiter.getRetryAfter(`register:${clientIp}`));
        }

        const body = await req.json().catch(() => null);
        const parsed = registerSchema.safeParse(body);
        if (!parsed.success) {
          return badRequest(parsed.error.errors[0]?.message || 'Invalid input');
        }

        const result = await authService.register(parsed.data);
        if ('error' in result && result.error) {
          return conflict(result.error);
        }

        return json(result, 201);
      }

      case '/api/auth/login': {
        if (req.method !== 'POST') return methodNotAllowed();

        // Rate limit: 5/minute per IP
        if (!rateLimiter.tryConsume(`login:${clientIp}`)) {
          return tooManyRequests(rateLimiter.getRetryAfter(`login:${clientIp}`));
        }

        const body = await req.json().catch(() => null);
        const parsed = loginSchema.safeParse(body);
        if (!parsed.success) {
          return badRequest(parsed.error.errors[0]?.message || 'Invalid input');
        }

        const result = await authService.login(parsed.data);
        if ('error' in result && result.error) {
          return unauthorized(result.error);
        }

        return json(result);
      }

      case '/api/auth/refresh': {
        if (req.method !== 'POST') return methodNotAllowed();

        const body = await req.json().catch(() => null);
        const parsed = refreshSchema.safeParse(body);
        if (!parsed.success) {
          return badRequest('Missing refresh token');
        }

        const result = await authService.refresh(parsed.data.refreshToken);
        if ('error' in result && result.error) {
          return unauthorized(result.error);
        }

        return json(result);
      }

      case '/api/auth/logout': {
        if (req.method !== 'POST') return methodNotAllowed();

        // Require authentication for audit trail
        const logoutPlayer = await authenticateRequest(req);
        if (!logoutPlayer?.sub) {
          return unauthorizedResponse();
        }

        const body = await req.json().catch(() => null) as { refreshToken?: string } | null;
        if (!body?.refreshToken) {
          return badRequest('Missing refresh token');
        }

        await authService.logout(body.refreshToken);
        return json({ success: true });
      }

      case '/api/auth/me': {
        if (req.method !== 'GET') return methodNotAllowed();

        const player = await authenticateRequest(req);
        if (!player?.sub) {
          return unauthorizedResponse();
        }

        const result = await authService.getProfile(player.sub);
        if ('error' in result && result.error) {
          return notFound(result.error);
        }

        return json(result);
      }

      default:
        return notFound('Route not found');
    }
  };
}
