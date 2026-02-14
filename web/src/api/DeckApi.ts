/**
 * Deck API client
 */

import { apiFetch } from './ApiClient';
import type { DeckData, DeckUnit } from '../data/types';

export interface ServerDeck {
  id: string;
  name: string;
  divisionId: string;
  activationPoints: number;
  units?: Array<{
    id: string;
    unitId: string;
    veterancy: number;
    quantity: number;
    transportId: string | null;
  }>;
}

export async function listDecks(): Promise<ServerDeck[]> {
  try {
    const res = await apiFetch('/api/decks');
    if (!res.ok) return [];
    const data = await res.json();
    return data.decks || [];
  } catch {
    return [];
  }
}

export async function getDeck(id: string): Promise<ServerDeck | null> {
  try {
    const res = await apiFetch(`/api/decks/${id}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.deck || null;
  } catch {
    return null;
  }
}

export async function createDeck(
  name: string,
  divisionId: string,
  units: DeckUnit[],
): Promise<{ success: true; deck: ServerDeck } | { success: false; error: string }> {
  try {
    const res = await apiFetch('/api/decks', {
      method: 'POST',
      body: JSON.stringify({ name, divisionId, units }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Failed to create deck' };
    }
    return { success: true, deck: data.deck };
  } catch {
    return { success: false, error: 'Network error' };
  }
}

export async function updateDeck(
  id: string,
  updates: Partial<{ name: string; divisionId: string; units: DeckUnit[] }>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await apiFetch(`/api/decks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const data = await res.json();
      return { success: false, error: data.error };
    }
    return { success: true };
  } catch {
    return { success: false, error: 'Network error' };
  }
}

export async function deleteDeck(id: string): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/decks/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function importDecks(
  localDecks: DeckData[],
): Promise<{ imported: number } | { error: string }> {
  try {
    const decks = localDecks.map((d) => ({
      name: d.name,
      divisionId: d.divisionId,
      units: d.units,
    }));

    const res = await apiFetch('/api/decks/import', {
      method: 'POST',
      body: JSON.stringify({ decks }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { error: data.error || 'Import failed' };
    }
    return { imported: data.imported };
  } catch {
    return { error: 'Network error' };
  }
}
