/**
 * Base HTTP client with JWT auto-refresh
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Enforce HTTPS in production builds
if (import.meta.env.PROD && !API_BASE.startsWith('https://')) {
  console.error('[Security] VITE_API_URL must use HTTPS in production. Current:', API_BASE);
}

let accessToken: string | null = null;
let refreshToken: string | null = null;

// Load tokens from localStorage on init
try {
  accessToken = localStorage.getItem('ss_access_token');
  refreshToken = localStorage.getItem('ss_refresh_token');
} catch {
  // localStorage not available
}

export function setTokens(access: string, refresh: string): void {
  accessToken = access;
  refreshToken = refresh;
  try {
    localStorage.setItem('ss_access_token', access);
    localStorage.setItem('ss_refresh_token', refresh);
  } catch {
    // localStorage not available
  }
}

export function clearTokens(): void {
  accessToken = null;
  refreshToken = null;
  try {
    localStorage.removeItem('ss_access_token');
    localStorage.removeItem('ss_refresh_token');
  } catch {
    // localStorage not available
  }
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function isAuthenticated(): boolean {
  return accessToken !== null;
}

export function getUsername(): string | null {
  if (!accessToken) return null;
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload));
    return decoded.username ?? null;
  } catch {
    return null;
  }
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      clearTokens();
      return false;
    }

    const data = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers);

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // Auto-refresh on 401
  if (res.status === 401 && refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers.set('Authorization', `Bearer ${accessToken}`);
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    }
  }

  return res;
}
