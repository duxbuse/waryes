/**
 * Match history API client
 */

import { apiFetch } from './ApiClient';

export interface MatchHistoryEntry {
  matchId: string;
  lobbyCode: string;
  mapSize: string;
  biome: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  winningTeam: string | null;
  status: string;
  team: string;
  kills: number;
  deaths: number;
  pointsCaptured: number;
  isWinner: boolean;
}

export async function getMatchHistory(
  limit: number = 20,
  offset: number = 0,
): Promise<MatchHistoryEntry[]> {
  try {
    const res = await apiFetch(`/api/matches/history?limit=${limit}&offset=${offset}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.matches || [];
  } catch {
    return [];
  }
}

export async function getMatchDetails(matchId: string) {
  try {
    const res = await apiFetch(`/api/matches/${matchId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
