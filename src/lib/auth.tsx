import { apiKeyClient } from "@better-auth/api-key/client";
import { useRouteContext, useRouter } from "@tanstack/react-router";
import { createServerFn, getGlobalStartContext } from "@tanstack/react-start";
import {
  adminClient,
  genericOAuthClient,
  inferAdditionalFields,
  organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import type { Auth as ServerAuth } from "@/cf-worker/auth";

export const authClient = createAuthClient({
  // SSR: module evaluates server-side, so guard window. The auth client is
  // browser-only (used for signIn/signOut actions); server-side code reaches
  // for the request middleware instead.
  baseURL: typeof window === "undefined" ? "" : window.location.origin,
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

type ServerSession = Awaited<ReturnType<ServerAuth["api"]["getSession"]>>;

export function deriveAuthState(session: ServerSession): AuthState | null {
  if (!session?.user) return null;
  const approved = session.user.approved ?? false;
  const orgId = session.session?.activeOrganizationId ?? null;
  return {
    approved,
    email: session.user.email,
    image: session.user.image ?? null,
    isAuthenticated: approved && !!orgId,
    name: session.user.name ?? null,
    orgId: approved ? orgId : null,
    role: session.user.role ?? "user",
    userId: session.user.id,
  };
}

// Server function for client-side `beforeLoad`. The request middleware in
// `src/start.ts` populates auth on the global start context; this just reads
// it back. Server-side `beforeLoad` doesn't need this — it reads
// `serverContext.auth` directly without a round-trip.
export const getSessionServerFn = createServerFn({ method: "GET" }).handler(
  () => getGlobalStartContext()?.auth ?? null
);

export async function logout(): Promise<void> {
  await authClient.signOut();
  window.location.href = "/";
}

export function useAuth(): AuthState {
  return useRouteContext({ from: "/_authed", select: (ctx) => ctx.auth });
}

// Refreshes auth state after operations that mutate session-affecting fields
// (e.g., redeeming an invite that flips `user.approved`). Better-Auth caches
// the session in a 5-minute encrypted cookie (`cookieCache.enabled: true` in
// the server config), so we hit `/api/auth/get-session?disableCookieCache=true`
// to force the cookie to refresh from the DB, then invalidate the router so
// `beforeLoad` re-reads the now-fresh session.
export function useRefreshAuth(): () => Promise<void> {
  const router = useRouter();
  return async () => {
    await authClient.getSession({ query: { disableCookieCache: true } });
    await router.invalidate();
  };
}
