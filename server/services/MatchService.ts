/**
 * MatchService - Match history recording and querying
 */

import { eq, desc, and, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { matches, matchParticipants, players } from '../db/schema';

export class MatchService {
  async createMatch(lobbyCode: string, mapSize: string, mapSeed: number, biome?: string) {
    const [match] = await db
      .insert(matches)
      .values({
        lobbyCode,
        mapSize,
        mapSeed,
        biome,
      })
      .returning();

    return match;
  }

  async addParticipant(
    matchId: string,
    playerId: string,
    team: 'team1' | 'team2',
    deckId?: string,
  ) {
    await db.insert(matchParticipants).values({
      matchId,
      playerId,
      team,
      deckId,
    });
  }

  async completeMatch(
    matchId: string,
    winningTeam: 'team1' | 'team2',
    durationSeconds: number,
    participantStats: Array<{
      playerId: string;
      kills: number;
      deaths: number;
      pointsCaptured: number;
      creditsSpent: number;
      isWinner: boolean;
    }>,
  ) {
    // Update match record
    await db
      .update(matches)
      .set({
        status: 'completed',
        winningTeam,
        durationSeconds,
        endedAt: new Date(),
      })
      .where(eq(matches.id, matchId));

    // Update participant stats
    for (const stats of participantStats) {
      await db
        .update(matchParticipants)
        .set({
          kills: stats.kills,
          deaths: stats.deaths,
          pointsCaptured: stats.pointsCaptured,
          creditsSpent: stats.creditsSpent,
          isWinner: stats.isWinner,
        })
        .where(
          and(
            eq(matchParticipants.matchId, matchId),
            eq(matchParticipants.playerId, stats.playerId),
          ),
        );

      // Update player stats
      await db
        .update(players)
        .set({
          totalGames: sql`${players.totalGames} + 1`,
          wins: stats.isWinner ? sql`${players.wins} + 1` : players.wins,
          losses: stats.isWinner ? players.losses : sql`${players.losses} + 1`,
        })
        .where(eq(players.id, stats.playerId));
    }
  }

  async abandonMatch(matchId: string) {
    await db
      .update(matches)
      .set({ status: 'abandoned', endedAt: new Date() })
      .where(eq(matches.id, matchId));
  }

  async getMatchHistory(playerId: string, limit: number = 20, offset: number = 0) {
    const results = await db
      .select({
        matchId: matches.id,
        lobbyCode: matches.lobbyCode,
        mapSize: matches.mapSize,
        biome: matches.biome,
        startedAt: matches.startedAt,
        endedAt: matches.endedAt,
        durationSeconds: matches.durationSeconds,
        winningTeam: matches.winningTeam,
        status: matches.status,
        team: matchParticipants.team,
        kills: matchParticipants.kills,
        deaths: matchParticipants.deaths,
        pointsCaptured: matchParticipants.pointsCaptured,
        isWinner: matchParticipants.isWinner,
      })
      .from(matchParticipants)
      .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
      .where(eq(matchParticipants.playerId, playerId))
      .orderBy(desc(matches.startedAt))
      .limit(limit)
      .offset(offset);

    return { matches: results };
  }

  async getMatchDetails(matchId: string) {
    const [match] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId))
      .limit(1);

    if (!match) {
      return { error: 'Match not found' };
    }

    const participants = await db
      .select({
        playerId: matchParticipants.playerId,
        playerName: players.displayName,
        team: matchParticipants.team,
        kills: matchParticipants.kills,
        deaths: matchParticipants.deaths,
        pointsCaptured: matchParticipants.pointsCaptured,
        creditsSpent: matchParticipants.creditsSpent,
        isWinner: matchParticipants.isWinner,
      })
      .from(matchParticipants)
      .innerJoin(players, eq(matchParticipants.playerId, players.id))
      .where(eq(matchParticipants.matchId, matchId));

    return { match, participants };
  }
}

export const matchService = new MatchService();
