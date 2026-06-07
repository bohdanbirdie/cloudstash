import { apiKeyClient } from "@better-auth/api-key/client";
import { useRouteContext, useRouter } from "@tanstack/react-router";
import {
  adminClient,
  genericOAuthClient,
  inferAdditionalFields,
  organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { useCallback } from "react";

import type { Auth as ServerAuth } from "@/cf-worker/auth";
import { ac, roles } from "@/lib/permissions";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [
    inferAdditionalFields<ServerAuth>(),
    organizationClient(),
    apiKeyClient(),
    adminClient({ ac, roles }),
    genericOAuthClient(),
  ],
});

export interface AuthState {
  userId: string;
  orgId: string | null;
  isAuthenticated: boolean;
  role: string;
  approved: boolean;
  name: string | null;
  email: string;
  image: string | null;
}

type Session = Awaited<ReturnType<typeof authClient.getSession>>["data"];

function deriveAuthState(session: Session): AuthState | null {
  if (!session?.user) return null;
  const user = session.user;
  const approved = user.approved ?? false;
  const orgId = session.session?.activeOrganizationId ?? null;
  return {
    approved,
    email: user.email,
    image: user.image ?? null,
    isAuthenticated: approved && !!orgId,
    name: user.name ?? null,
    orgId: approved ? orgId : null,
    role: user.role ?? "user",
    userId: user.id,
  };
}

// `/api/auth/*` is rate-limited at 30/60s, so coalesce and cache sessions.
const AUTH_TTL_MS = 30_000;
let authCache: { value: AuthState | null; expiresAt: number } | null = null;
let inflight: Promise<AuthState | null> | null = null;

const fetchAuth = async (): Promise<AuthState | null> => {
  const { data } = await authClient.getSession();
  const value = deriveAuthState(data);
  authCache = { expiresAt: Date.now() + AUTH_TTL_MS, value };
  return value;
};

export async function loadAuth(): Promise<AuthState | null> {
  if (authCache && authCache.expiresAt > Date.now()) {
    return authCache.value;
  }
  if (!inflight) {
    inflight = fetchAuth().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export function invalidateAuthCache(): void {
  authCache = null;
  inflight = null;
}

export function useAuth(): AuthState {
  return useRouteContext({ from: "/_authed", select: (ctx) => ctx.auth });
}

export function useRefreshAuth(): () => Promise<void> {
  const router = useRouter();
  return useCallback(async () => {
    invalidateAuthCache();
    await authClient.getSession({
      fetchOptions: { query: { disableCookieCache: "true" } },
    });
    await router.invalidate();
  }, [router]);
}

export async function logout(): Promise<void> {
  invalidateAuthCache();
  await authClient.signOut();
  window.location.href = "/";
}
