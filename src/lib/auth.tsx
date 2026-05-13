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

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [
    inferAdditionalFields<ServerAuth>(),
    organizationClient(),
    apiKeyClient(),
    adminClient(),
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

// `beforeLoad` reads session state from Better-Auth on every match. Better-Auth
// caches the session cookie server-side for 5 minutes, so repeat calls are
// effectively free — no in-memory cache layer needed on top.
export async function loadAuth(): Promise<AuthState | null> {
  const { data } = await authClient.getSession();
  return deriveAuthState(data);
}

// `_authed.beforeLoad` returns `{ auth }`, so any component under that route
// can read the resolved AuthState from router context. Outside `_authed` you
// should call `loadAuth()` directly — there's no auth to read in context.
export function useAuth(): AuthState {
  return useRouteContext({ from: "/_authed", select: (ctx) => ctx.auth });
}

// Bypasses Better-Auth's 5-min cookie cache (so the next `getSession()` sees
// fresh server state) and re-runs `beforeLoad` via `router.invalidate()`.
// Used after flipping `user.approved` through invite redemption.
export function useRefreshAuth(): () => Promise<void> {
  const router = useRouter();
  return useCallback(async () => {
    await authClient.getSession({
      fetchOptions: { query: { disableCookieCache: "true" } },
    });
    await router.invalidate();
  }, [router]);
}

export async function logout(): Promise<void> {
  await authClient.signOut();
  window.location.href = "/";
}
