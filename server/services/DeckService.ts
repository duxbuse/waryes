/**
 * DeckService - CRUD operations for player decks
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../db/client';
import { decks, deckUnits } from '../db/schema';
import type { CreateDeckInput, ImportDecksInput } from '../validation/schemas';

export class DeckService {
  async listDecks(playerId: string) {
    const playerDecks = await db
      .select({
        id: decks.id,
        name: decks.name,
        divisionId: decks.divisionId,
        activationPoints: decks.activationPoints,
        createdAt: decks.createdAt,
        updatedAt: decks.updatedAt,
      })
      .from(decks)
      .where(eq(decks.playerId, playerId));

    return { decks: playerDecks };
  }

  async getDeck(deckId: string, playerId: string) {
    const [deck] = await db
      .select()
      .from(decks)
      .where(and(eq(decks.id, deckId), eq(decks.playerId, playerId)))
      .limit(1);

    if (!deck) {
      return { error: 'Deck not found' };
    }

    const units = await db
      .select({
        id: deckUnits.id,
        unitId: deckUnits.unitId,
        veterancy: deckUnits.veterancy,
        quantity: deckUnits.quantity,
        transportId: deckUnits.transportId,
      })
      .from(deckUnits)
      .where(eq(deckUnits.deckId, deckId));

    return {
      deck: {
        id: deck.id,
        name: deck.name,
        divisionId: deck.divisionId,
        activationPoints: deck.activationPoints,
        units,
      },
    };
  }

  async createDeck(playerId: string, input: CreateDeckInput) {
    // Calculate activation points
    const activationPoints = input.units.reduce(
      (sum, u) => sum + u.quantity,
      0,
    );

    if (activationPoints > 50) {
      return { error: 'Deck exceeds 50 activation points' };
    }

    const [deck] = await db
      .insert(decks)
      .values({
        playerId,
        name: input.name,
        divisionId: input.divisionId,
        activationPoints,
      })
      .returning();

    if (!deck) {
      return { error: 'Failed to create deck' };
    }

    // Insert deck units
    if (input.units.length > 0) {
      await db.insert(deckUnits).values(
        input.units.map((u) => ({
          deckId: deck.id,
          unitId: u.unitId,
          veterancy: u.veterancy,
          quantity: u.quantity,
          transportId: u.transportId,
        })),
      );
    }

    return { deck: { id: deck.id, name: deck.name, divisionId: deck.divisionId, activationPoints } };
  }

  async updateDeck(deckId: string, playerId: string, input: Partial<CreateDeckInput>) {
    // Verify ownership
    const [existing] = await db
      .select({ id: decks.id })
      .from(decks)
      .where(and(eq(decks.id, deckId), eq(decks.playerId, playerId)))
      .limit(1);

    if (!existing) {
      return { error: 'Deck not found' };
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name) updates.name = input.name;
    if (input.divisionId) updates.divisionId = input.divisionId;

    if (input.units) {
      const activationPoints = input.units.reduce((sum, u) => sum + u.quantity, 0);
      if (activationPoints > 50) {
        return { error: 'Deck exceeds 50 activation points' };
      }
      updates.activationPoints = activationPoints;

      // Replace all units
      await db.delete(deckUnits).where(eq(deckUnits.deckId, deckId));
      if (input.units.length > 0) {
        await db.insert(deckUnits).values(
          input.units.map((u) => ({
            deckId,
            unitId: u.unitId,
            veterancy: u.veterancy,
            quantity: u.quantity,
            transportId: u.transportId,
          })),
        );
      }
    }

    await db.update(decks).set(updates).where(eq(decks.id, deckId));

    return { success: true };
  }

  async deleteDeck(deckId: string, playerId: string) {
    const result = await db
      .delete(decks)
      .where(and(eq(decks.id, deckId), eq(decks.playerId, playerId)));

    if (result.length === 0) {
      return { error: 'Deck not found' };
    }

    return { success: true };
  }

  async importDecks(playerId: string, input: ImportDecksInput) {
    const imported: string[] = [];

    for (const deckInput of input.decks) {
      const activationPoints = deckInput.units.reduce((sum, u) => sum + u.quantity, 0);

      const [deck] = await db
        .insert(decks)
        .values({
          playerId,
          name: deckInput.name,
          divisionId: deckInput.divisionId,
          activationPoints: Math.min(activationPoints, 50),
        })
        .returning();

      if (deck && deckInput.units.length > 0) {
        await db.insert(deckUnits).values(
          deckInput.units.map((u) => ({
            deckId: deck.id,
            unitId: u.unitId,
            veterancy: u.veterancy,
            quantity: u.quantity,
            transportId: u.transportId,
          })),
        );
        imported.push(deck.id);
      }
    }

    return { imported: imported.length, deckIds: imported };
  }
}

export const deckService = new DeckService();
