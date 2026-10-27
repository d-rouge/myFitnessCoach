const TOKEN_KEY = "health-trainer.token";
const LOGGED_OUT_KEY = "health-trainer.logged-out";
const HEVY_KEY = "health-trainer.hevy-api-key";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  roles: string[];
}

export interface AuthStatus {
  googleConfigured: boolean;
  googleClientId: string | null;
  allowedEmailsCount: number;
  devLoginEnabled: boolean;
}

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  // An explicit login cancels a previous logout: auto-bootstrap may resume.
  window.localStorage.removeItem(LOGGED_OUT_KEY);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

function wasLoggedOut(): boolean {
  try {
    return window.localStorage.getItem(LOGGED_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const response = await fetch("/api/auth/status");
  if (!response.ok) throw new Error(`Auth status failed (${response.status})`);
  return response.json() as Promise<AuthStatus>;
}

export async function loginDev(): Promise<string> {
  const response = await fetch("/api/auth/dev-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "Dev login failed");
  }
  const data = (await response.json()) as { token: string };
  setToken(data.token);
  return data.token;
}

/** Exchanges a Google Identity Services ID token for a session JWT. */
export async function loginWithGoogle(idToken: string): Promise<SessionUser> {
  const response = await fetch("/api/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Google login failed (${response.status})`);
  }

  const data = (await response.json()) as { token: string; user: SessionUser };
  setToken(data.token);
  return data.user;
}

export function logout(): void {
  clearToken();
  try {
    // Prevent the dev auto-login from silently signing the athlete back in.
    window.localStorage.setItem(LOGGED_OUT_KEY, "1");
  } catch {
    // Storage unavailable: in-memory state is already cleared.
  }
}

/** The Hevy key is optional: the API can fall back to HEVY_API_KEY. */
export function getHevyApiKey(): string {
  try {
    return window.localStorage.getItem(HEVY_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setHevyApiKey(apiKey: string): void {
  try {
    const trimmed = apiKey.trim();
    if (trimmed) window.localStorage.setItem(HEVY_KEY, trimmed);
    else window.localStorage.removeItem(HEVY_KEY);
  } catch {
    // Storage may be unavailable (private mode); the key stays in memory.
  }
}

let bootstrap: Promise<string | null> | null = null;

async function bootstrapSession(): Promise<string | null> {
  try {
    if (wasLoggedOut()) return null;
    const status = await fetchAuthStatus();
    if (!status.devLoginEnabled) return null;
    return await loginDev();
  } catch {
    return null;
  }
}

async function ensureToken(): Promise<string | null> {
  const existing = getToken();
  if (existing) return existing;

  if (!bootstrap) {
    bootstrap = bootstrapSession().finally(() => {
      bootstrap = null;
    });
  }
  return bootstrap;
}

/**
 * Authenticated fetch. It bootstraps a dev session when enabled and attaches
 * the bearer token to every request.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const token = await ensureToken();
  const headers = new Headers(init.headers);

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) {
    clearToken();
  }
  return response;
}

export async function fetchMe(): Promise<SessionUser> {
  const response = await apiFetch("/api/me");
  if (!response.ok) {
    throw new Error(`Authentication required (${response.status})`);
  }
  return response.json() as Promise<SessionUser>;
}

function filenameFromDisposition(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return match?.[1] ?? fallback;
}

/** Downloads a protected file by fetching it with the bearer token. */
export async function downloadWithAuth(url: string, fallbackName: string): Promise<void> {
  const response = await apiFetch(url);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Download failed (${response.status})`);
  }

  const blob = await response.blob();
  const filename = filenameFromDisposition(
    response.headers.get("Content-Disposition"),
    fallbackName,
  );
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
