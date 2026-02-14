/**
 * Database schema for Stellar Siege
 * Using Drizzle ORM with PostgreSQL
 */

import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  text,
  pgEnum,
} from 'drizzle-orm/pg-core';

// Enums
export const matchStatusEnum = pgEnum('match_status', [
  'in_progress',
  'completed',
  'abandoned',
]);

export const teamEnum = pgEnum('team', ['team1', 'team2']);

// Players table
export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 32 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 64 }).notNull(),
  legacyPlayerId: varchar('legacy_player_id', { length: 64 }),
  totalGames: integer('total_games').notNull().default(0),
  wins: integer('wins').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLogin: timestamp('last_login', { withTimezone: true }),
  isBanned: boolean('is_banned').notNull().default(false),
});

// Decks table
export const decks = pgTable('decks', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id')
    .notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 128 }).notNull(),
  divisionId: varchar('division_id', { length: 64 }).notNull(),
  activationPoints: integer('activation_points').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Deck units table
export const deckUnits = pgTable('deck_units', {
  id: uuid('id').primaryKey().defaultRandom(),
  deckId: uuid('deck_id')
    .notNull()
    .references(() => decks.id, { onDelete: 'cascade' }),
  unitId: varchar('unit_id', { length: 64 }).notNull(),
  veterancy: integer('veterancy').notNull().default(0),
  quantity: integer('quantity').notNull().default(1),
  transportId: varchar('transport_id', { length: 64 }),
});

// Matches table
export const matches = pgTable('matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  lobbyCode: varchar('lobby_code', { length: 16 }).notNull(),
  mapSize: varchar('map_size', { length: 16 }).notNull(),
  mapSeed: integer('map_seed').notNull(),
  biome: varchar('biome', { length: 32 }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  durationSeconds: integer('duration_seconds'),
  winningTeam: teamEnum('winning_team'),
  status: matchStatusEnum('status').notNull().default('in_progress'),
});

// Match participants table
export const matchParticipants = pgTable('match_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  matchId: uuid('match_id')
    .notNull()
    .references(() => matches.id, { onDelete: 'cascade' }),
  playerId: uuid('player_id')
    .notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  team: teamEnum('team').notNull(),
  deckId: uuid('deck_id').references(() => decks.id),
  kills: integer('kills').notNull().default(0),
  deaths: integer('deaths').notNull().default(0),
  pointsCaptured: integer('points_captured').notNull().default(0),
  creditsSpent: integer('credits_spent').notNull().default(0),
  isWinner: boolean('is_winner').notNull().default(false),
});

// Refresh tokens table
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id')
    .notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revoked: boolean('revoked').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Type exports for use in services
export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
export type Deck = typeof decks.$inferSelect;
export type NewDeck = typeof decks.$inferInsert;
export type DeckUnit = typeof deckUnits.$inferSelect;
export type NewDeckUnit = typeof deckUnits.$inferInsert;
export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
export type MatchParticipant = typeof matchParticipants.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;
