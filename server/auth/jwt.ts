/**
 * JWT token management using jose library
 * Access tokens (15min) + Refresh tokens (7 days)
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

const jwtSecretRaw = process.env.JWT_SECRET;
if (!jwtSecretRaw) {
  throw new Error('JWT_SECRET environment variable is required. Generate one with: openssl rand -hex 32');
}
const JWT_SECRET = new TextEncoder().encode(jwtSecretRaw);

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

export interface TokenPayload extends JWTPayload {
  sub: string; // player ID
  username: string;
  type: 'access' | 'refresh';
}

export async function signAccessToken(playerId: string, username: string): Promise<string> {
  return new SignJWT({ username, type: 'access' } as TokenPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(playerId)
    .setIssuer('stellar-siege')
    .setAudience('stellar-siege-api')
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

export async function signRefreshToken(playerId: string, username: string): Promise<string> {
  return new SignJWT({ username, type: 'refresh' } as TokenPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(playerId)
    .setIssuer('stellar-siege')
    .setAudience('stellar-siege-api')
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET, {
    issuer: 'stellar-siege',
    audience: 'stellar-siege-api',
  });
  return payload as TokenPayload;
}
