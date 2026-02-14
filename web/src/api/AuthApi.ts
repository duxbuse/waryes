/**
 * Auth API client
 */

import { apiFetch, setTokens, clearTokens } from './ApiClient';

export interface PlayerProfile {
  id: string;
  username: string;
  displayName: string;
  totalGames: number;
  wins: number;
  losses: number;
}

export interface AuthResponse {
  player: PlayerProfile;
  accessToken: string;
  refreshToken: string;
}

export async function register(
  username: string,
  email: string,
  password: string,
  displayName: string,
): Promise<{ success: true; player: PlayerProfile } | { success: false; error: string }> {
  try {
    const res = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, displayName }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Registration failed' };
    }

    setTokens(data.accessToken, data.refreshToken);
    return { success: true, player: data.player };
  } catch {
    return { success: false, error: 'Network error' };
  }
}

export async function login(
  username: string,
  password: string,
): Promise<{ success: true; player: PlayerProfile } | { success: false; error: string }> {
  try {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Login failed' };
    }

    setTokens(data.accessToken, data.refreshToken);
    return { success: true, player: data.player };
  } catch {
    return { success: false, error: 'Network error' };
  }
}

export async function logout(): Promise<void> {
  try {
    const refreshToken = localStorage.getItem('ss_refresh_token');
    if (refreshToken) {
      await apiFetch('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    }
  } catch {
    // Best-effort logout
  }
  clearTokens();
}

export async function getProfile(): Promise<PlayerProfile | null> {
  try {
    const res = await apiFetch('/api/auth/me');
    if (!res.ok) return null;
    const data = await res.json();
    return data.player;
  } catch {
    return null;
  }
}
