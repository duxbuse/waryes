/**
 * Deck API routes
 */

import { deckService } from '../services/DeckService';
import { authenticateRequest, unauthorizedResponse } from '../auth/middleware';
import { createDeckSchema, updateDeckSchema, importDecksSchema } from '../validation/schemas';

export async function handleDeckRoute(req: Request, path: string): Promise<Response> {
  const player = await authenticateRequest(req);
  if (!player?.sub) {
    return unauthorizedResponse();
  }
  const playerId = player.sub;

  // GET /api/decks - List decks
  if (path === '/api/decks' && req.method === 'GET') {
    const result = await deckService.listDecks(playerId);
    return json(result);
  }

  // POST /api/decks - Create deck
  if (path === '/api/decks' && req.method === 'POST') {
    const body = await req.json().catch(() => null);
    const parsed = createDeckSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.errors[0]?.message || 'Invalid input' }, 400);
    }

    const result = await deckService.createDeck(playerId, parsed.data);
    if ('error' in result) {
      return json(result, 400);
    }
    return json(result, 201);
  }

  // POST /api/decks/import - Import decks from localStorage
  if (path === '/api/decks/import' && req.method === 'POST') {
    const body = await req.json().catch(() => null);
    const parsed = importDecksSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.errors[0]?.message || 'Invalid input' }, 400);
    }

    const result = await deckService.importDecks(playerId, parsed.data);
    return json(result, 201);
  }

  // Routes with :id parameter
  const deckIdMatch = path.match(/^\/api\/decks\/([a-f0-9-]+)$/);
  if (deckIdMatch?.[1]) {
    const deckId = deckIdMatch[1];

    // GET /api/decks/:id
    if (req.method === 'GET') {
      const result = await deckService.getDeck(deckId, playerId);
      if ('error' in result) {
        return json(result, 404);
      }
      return json(result);
    }

    // PUT /api/decks/:id
    if (req.method === 'PUT') {
      const body = await req.json().catch(() => null);
      const parsed = updateDeckSchema.safeParse(body);
      if (!parsed.success) {
        return json({ error: parsed.error.errors[0]?.message || 'Invalid input' }, 400);
      }

      const result = await deckService.updateDeck(deckId, playerId, parsed.data);
      if ('error' in result) {
        return json(result, 'error' in result && result.error === 'Deck not found' ? 404 : 400);
      }
      return json(result);
    }

    // DELETE /api/decks/:id
    if (req.method === 'DELETE') {
      const result = await deckService.deleteDeck(deckId, playerId);
      if ('error' in result) {
        return json(result, 404);
      }
      return json(result);
    }
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
