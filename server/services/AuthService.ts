/**
 * AuthService - Handles user registration, login, and token management
 */

import { eq, and, or, lt } from 'drizzle-orm';
import { db } from '../db/client';
import { players, refreshTokens } from '../db/schema';
import { hashPassword, verifyPassword } from '../auth/password';
import { signAccessToken, signRefreshToken, verifyToken } from '../auth/jwt';
import type { RegisterInput, LoginInput } from '../validation/schemas';

export class AuthService {
  async register(input: RegisterInput) {
    // Check for existing username
    const existingUsername = await db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.username, input.username))
      .limit(1);
    if (existingUsername.length > 0) {
      return { error: 'Username already taken' };
    }

    // Check for existing email
    const existingEmail = await db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.email, input.email))
      .limit(1);
    if (existingEmail.length > 0) {
      return { error: 'Email already registered' };
    }

    const passwordHash = await hashPassword(input.password);

    const [player] = await db.insert(players).values({
      username: input.username,
      email: input.email,
      passwordHash,
      displayName: input.displayName,
    }).returning({
      id: players.id,
      username: players.username,
      displayName: players.displayName,
    });

    if (!player) {
      return { error: 'Failed to create player' };
    }

    const accessToken = await signAccessToken(player.id, player.username);
    const refreshToken = await signRefreshToken(player.id, player.username);

    // Store refresh token hash
    const tokenHash = new Bun.CryptoHasher('sha256').update(refreshToken).digest('hex');
    await db.insert(refreshTokens).values({
      playerId: player.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    return {
      player: {
        id: player.id,
        username: player.username,
        displayName: player.displayName,
      },
      accessToken,
      refreshToken,
    };
  }

  async login(input: LoginInput) {
    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.username, input.username))
      .limit(1);

    if (!player) {
      return { error: 'Invalid username or password' };
    }

    if (player.isBanned) {
      return { error: 'Account is banned' };
    }

    const valid = await verifyPassword(input.password, player.passwordHash);
    if (!valid) {
      return { error: 'Invalid username or password' };
    }

    // Update last login
    await db
      .update(players)
      .set({ lastLogin: new Date() })
      .where(eq(players.id, player.id));

    const accessToken = await signAccessToken(player.id, player.username);
    const refreshToken = await signRefreshToken(player.id, player.username);

    // Store refresh token hash
    const tokenHash = new Bun.CryptoHasher('sha256').update(refreshToken).digest('hex');
    await db.insert(refreshTokens).values({
      playerId: player.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return {
      player: {
        id: player.id,
        username: player.username,
        displayName: player.displayName,
        totalGames: player.totalGames,
        wins: player.wins,
        losses: player.losses,
      },
      accessToken,
      refreshToken,
    };
  }

  async refresh(refreshTokenValue: string) {
    let payload;
    try {
      payload = await verifyToken(refreshTokenValue);
    } catch {
      return { error: 'Invalid refresh token' };
    }

    if (payload.type !== 'refresh' || !payload.sub) {
      return { error: 'Invalid token type' };
    }

    // Verify token exists in DB and not revoked
    const tokenHash = new Bun.CryptoHasher('sha256').update(refreshTokenValue).digest('hex');
    const [storedToken] = await db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          eq(refreshTokens.revoked, false),
        ),
      )
      .limit(1);

    if (!storedToken || storedToken.expiresAt < new Date()) {
      return { error: 'Refresh token expired or revoked' };
    }

    // Check if user is banned before issuing new tokens
    const [player] = await db
      .select({ isBanned: players.isBanned })
      .from(players)
      .where(eq(players.id, payload.sub))
      .limit(1);
    if (!player || player.isBanned) {
      // Revoke the token since account is banned
      await db
        .update(refreshTokens)
        .set({ revoked: true })
        .where(eq(refreshTokens.id, storedToken.id));
      return { error: 'Account is banned' };
    }

    // Revoke old token (token rotation)
    await db
      .update(refreshTokens)
      .set({ revoked: true })
      .where(eq(refreshTokens.id, storedToken.id));

    // Issue new tokens
    const accessToken = await signAccessToken(payload.sub, payload.username);
    const newRefreshToken = await signRefreshToken(payload.sub, payload.username);

    // Store new refresh token
    const newTokenHash = new Bun.CryptoHasher('sha256').update(newRefreshToken).digest('hex');
    await db.insert(refreshTokens).values({
      playerId: payload.sub,
      tokenHash: newTokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(refreshTokenValue: string) {
    const tokenHash = new Bun.CryptoHasher('sha256').update(refreshTokenValue).digest('hex');
    await db
      .update(refreshTokens)
      .set({ revoked: true })
      .where(eq(refreshTokens.tokenHash, tokenHash));
    return { success: true };
  }

  async getProfile(playerId: string) {
    const [player] = await db
      .select({
        id: players.id,
        username: players.username,
        displayName: players.displayName,
        totalGames: players.totalGames,
        wins: players.wins,
        losses: players.losses,
        createdAt: players.createdAt,
      })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);

    if (!player) {
      return { error: 'Player not found' };
    }

    return { player };
  }

  /**
   * Remove expired and revoked refresh tokens from the database.
   * Should be called periodically to prevent table bloat.
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await db
      .delete(refreshTokens)
      .where(
        or(
          lt(refreshTokens.expiresAt, new Date()),
          eq(refreshTokens.revoked, true),
        ),
      )
      .returning({ id: refreshTokens.id });
    return result.length;
  }
}

export const authService = new AuthService();

// Periodic cleanup of expired/revoked refresh tokens (every hour)
setInterval(async () => {
  try {
    const deleted = await authService.cleanupExpiredTokens();
    if (deleted > 0) {
      console.log(`[Auth] Cleaned up ${deleted} expired/revoked refresh tokens`);
    }
  } catch (err) {
    console.error('[Auth] Token cleanup failed:', err);
  }
}, 3600000);
