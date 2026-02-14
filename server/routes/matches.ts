/**
 * Match API routes
 */

import { matchService } from '../services/MatchService';
import { authenticateRequest, unauthorizedResponse } from '../auth/middleware';

export async function handleMatchRoute(req: Request, path: string): Promise<Response> {
  const player = await authenticateRequest(req);
  if (!player?.sub) {
    return unauthorizedResponse();
  }

  // GET /api/matches/history
  if (path === '/api/matches/history' && req.method === 'GET') {
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(parseInt(url.searchParams.get('limit') || '20') || 20, 100));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0') || 0);

    const result = await matchService.getMatchHistory(player.sub, limit, offset);
    return json(result);
  }

  // GET /api/matches/:id
  const matchIdMatch = path.match(/^\/api\/matches\/([a-f0-9-]+)$/);
  if (matchIdMatch?.[1] && req.method === 'GET') {
    const result = await matchService.getMatchDetails(matchIdMatch[1]);
    if ('error' in result) {
      return json(result, 404);
    }
    return json(result);
  }

  return json({ error: 'Not found' }, 404);
}

function json(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
    },
  });
}
