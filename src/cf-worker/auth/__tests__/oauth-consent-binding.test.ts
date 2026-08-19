import { describe, it } from "@effect/vitest";
import { makeSignature } from "better-auth/crypto";
import { Clock, Effect } from "effect";
import { TestClock } from "effect/testing";
import { expect, vi } from "vitest";

import type { Auth } from "..";
import {
  bindConsentWorkspace,
  validateConsentWorkspaceBinding,
} from "../oauth-consent-binding";
import { canonicalizeOAuthQuery } from "../oauth-consent-state";

const env = {
  BETTER_AUTH_SECRET: "test-secret-for-oauth-consent-binding-32-chars",
  BETTER_AUTH_URL: "https://cloudstash.test/api/auth",
} as const;

const signedOAuthQuery = Effect.fnUntraced(function* (
  extra: Record<string, string> = {}
) {
  const now = yield* Clock.currentTimeMillis;
  const params = new URLSearchParams({
    client_id: "mcp-client",
    exp: String(Math.floor(now / 1_000) + 600),
    ...extra,
  });
  const signedNames = [...new Set([...params.keys(), "ba_param"])].toSorted();
  for (const name of signedNames) params.append("ba_param", name);
  const signature = yield* Effect.promise(() =>
    makeSignature(canonicalizeOAuthQuery(params), env.BETTER_AUTH_SECRET)
  );
  params.set("sig", signature);
  return params.toString();
});

const authWithActiveWorkspace = (
  organizationId: string | null,
  inspectHeaders?: (headers: Headers) => void
) =>
  ({
    api: {
      getSession: vi.fn(async ({ headers }: { headers: Headers }) => {
        inspectHeaders?.(headers);
        return { session: { activeOrganizationId: organizationId } };
      }),
    },
  }) as unknown as Auth;

const bindWorkspace = Effect.fnUntraced(function* (
  organizationId = "workspace-a",
  options: {
    readonly requestCookie?: string;
    readonly requestPath?: string;
    readonly responseCookie?: string;
    readonly query?: string;
    readonly inspectHeaders?: (headers: Headers) => void;
  } = {}
) {
  const query = options.query ?? (yield* signedOAuthQuery());
  const headers = new Headers({
    Location: `https://cloudstash.test/oauth-consent?${query}`,
  });
  if (options.responseCookie)
    headers.append("Set-Cookie", options.responseCookie);
  const requestHeaders = new Headers();
  if (options.requestCookie)
    requestHeaders.set("Cookie", options.requestCookie);

  const response = yield* bindConsentWorkspace(
    new Response(null, { headers, status: 302 }),
    new Request(
      `https://cloudstash.test${options.requestPath ?? "/api/auth/oauth2/authorize"}`,
      { headers: requestHeaders }
    ),
    authWithActiveWorkspace(organizationId, options.inspectHeaders),
    env
  );
  const binding = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("cloudstash_mcp_consent="));
  return { cookie: binding?.split(";", 1)[0] ?? "", query, response };
});

const consentRequest = (cookie: string, query: string) =>
  new Request("https://cloudstash.test/api/auth/oauth2/consent", {
    body: JSON.stringify({ accept: true, oauth_query: query }),
    headers: { "Content-Type": "application/json", Cookie: cookie },
    method: "POST",
  });

describe("OAuth consent workspace binding", () => {
  it.effect("binds the request-cookie session on the authorize path", () =>
    Effect.gen(function* () {
      const { cookie } = yield* bindWorkspace("workspace-a", {
        requestCookie: "better-auth.session_token=request-session",
        inspectHeaders: (headers) => {
          expect(headers.get("cookie")).toContain(
            "better-auth.session_token=request-session"
          );
        },
      });
      expect(cookie).toContain("cloudstash_mcp_consent=");
    })
  );

  it.effect("binds a social callback using its new response session", () =>
    Effect.gen(function* () {
      const { cookie, response } = yield* bindWorkspace("workspace-a", {
        requestPath: "/api/auth/callback/google",
        responseCookie:
          "better-auth.session_token=callback-session; Path=/; HttpOnly; Secure",
        inspectHeaders: (headers) => {
          expect(headers.get("cookie")).toContain(
            "better-auth.session_token=callback-session"
          );
        },
      });

      expect(cookie).toContain("cloudstash_mcp_consent=");
      expect(response.headers.getSetCookie()).toEqual(
        expect.arrayContaining([
          expect.stringContaining("better-auth.session_token=callback-session"),
          expect.stringContaining("cloudstash_mcp_consent="),
        ])
      );
    })
  );

  it.effect("binds a JSON OAuth resume without consuming its body", () =>
    Effect.gen(function* () {
      const query = yield* signedOAuthQuery();
      const response = yield* bindConsentWorkspace(
        Response.json(
          {
            redirect: true,
            url: `https://cloudstash.test/oauth-consent?${query}`,
          },
          {
            headers: {
              "Set-Cookie":
                "better-auth.session_token=signin-session; Path=/; HttpOnly; Secure",
            },
          }
        ),
        new Request("https://cloudstash.test/api/auth/sign-in/email", {
          method: "POST",
        }),
        authWithActiveWorkspace("workspace-a", (headers) => {
          expect(headers.get("cookie")).toContain(
            "better-auth.session_token=signin-session"
          );
        }),
        env
      );

      expect(response.headers.getSetCookie()).toEqual(
        expect.arrayContaining([
          expect.stringContaining("better-auth.session_token=signin-session"),
          expect.stringContaining("cloudstash_mcp_consent="),
        ])
      );
      expect(yield* Effect.promise(() => response.json())).toEqual({
        redirect: true,
        url: `https://cloudstash.test/oauth-consent?${query}`,
      });
    })
  );

  it.effect("accepts the signed query and bound workspace", () =>
    Effect.gen(function* () {
      const { cookie, query } = yield* bindWorkspace();
      const response = yield* validateConsentWorkspaceBinding(
        consentRequest(cookie, query),
        authWithActiveWorkspace("workspace-a"),
        env
      );
      expect(response).toBeNull();
    })
  );

  it.effect("matches Better Auth's code-unit query ordering", () =>
    Effect.gen(function* () {
      const params = new URLSearchParams(
        "resource=z&Z_ext=1&client_id=mcp-client&resource=A&_ext=2&exp=4102444800" +
          "&ba_param=resource&ba_param=Z_ext&ba_param=client_id" +
          "&ba_param=_ext&ba_param=exp&ba_param=ba_param"
      );
      const canonical = new URLSearchParams();
      for (const [key, value] of [
        ["Z_ext", "1"],
        ["_ext", "2"],
        ["ba_param", "Z_ext"],
        ["ba_param", "_ext"],
        ["ba_param", "ba_param"],
        ["ba_param", "client_id"],
        ["ba_param", "exp"],
        ["ba_param", "resource"],
        ["client_id", "mcp-client"],
        ["exp", "4102444800"],
        ["resource", "A"],
        ["resource", "z"],
      ] as const) {
        canonical.append(key, value);
      }
      params.set(
        "sig",
        yield* Effect.promise(() =>
          makeSignature(canonical.toString(), env.BETTER_AUTH_SECRET)
        )
      );

      const { cookie } = yield* bindWorkspace("workspace-a", {
        query: params.toString(),
      });
      expect(cookie).toContain("cloudstash_mcp_consent=");
    })
  );

  it.effect("rejects when another tab changes the active workspace", () =>
    Effect.gen(function* () {
      const { cookie, query } = yield* bindWorkspace("workspace-a");
      const response = yield* validateConsentWorkspaceBinding(
        consentRequest(cookie, query),
        authWithActiveWorkspace("workspace-b"),
        env
      );

      expect(response?.status).toBe(400);
      expect(yield* Effect.promise(() => response!.json())).toMatchObject({
        error: "invalid_request",
        error_description: expect.stringContaining("Restart"),
      });
      expect(response?.headers.get("Set-Cookie")).toContain("Max-Age=0");
    })
  );

  it.effect("rejects a different signed authorization query", () =>
    Effect.gen(function* () {
      const { cookie } = yield* bindWorkspace();
      const otherQuery = yield* signedOAuthQuery({ state: "other" });
      const response = yield* validateConsentWorkspaceBinding(
        consentRequest(cookie, otherQuery),
        authWithActiveWorkspace("workspace-a"),
        env
      );
      expect(response?.status).toBe(400);
    })
  );

  it.effect("rejects a missing binding cookie", () =>
    Effect.gen(function* () {
      const query = yield* signedOAuthQuery();
      const response = yield* validateConsentWorkspaceBinding(
        consentRequest("", query),
        authWithActiveWorkspace("workspace-a"),
        env
      );
      expect(response?.status).toBe(400);
      expect(response?.headers.get("Set-Cookie")).toContain("Max-Age=0");
    })
  );

  it.effect("rejects a tampered binding cookie", () =>
    Effect.gen(function* () {
      const { cookie, query } = yield* bindWorkspace();
      const response = yield* validateConsentWorkspaceBinding(
        consentRequest(`${cookie.slice(0, -1)}x`, query),
        authWithActiveWorkspace("workspace-a"),
        env
      );
      expect(response?.status).toBe(400);
    })
  );

  it.effect("rejects an expired binding cookie", () =>
    Effect.gen(function* () {
      const { cookie, query } = yield* bindWorkspace();
      yield* TestClock.adjust("11 minutes");
      const response = yield* validateConsentWorkspaceBinding(
        consentRequest(cookie, query),
        authWithActiveWorkspace("workspace-a"),
        env
      );
      expect(response?.status).toBe(400);
    })
  );

  it.effect("rejects a binding without an active workspace", () =>
    Effect.gen(function* () {
      const { cookie, query } = yield* bindWorkspace();
      const response = yield* validateConsentWorkspaceBinding(
        consentRequest(cookie, query),
        authWithActiveWorkspace(null),
        env
      );
      expect(response?.status).toBe(400);
    })
  );

  it.effect("does not bind an unsigned consent Location", () =>
    Effect.gen(function* () {
      const { cookie } = yield* bindWorkspace("workspace-a", {
        query: "client_id=mcp-client&exp=9999999999&sig=forged",
      });
      expect(cookie).toBe("");
    })
  );

  it.effect("clears the binding cookie after consent submission", () =>
    Effect.gen(function* () {
      const { cookie, query } = yield* bindWorkspace();
      const response = yield* bindConsentWorkspace(
        Response.json({ url: "http://127.0.0.1/callback" }),
        consentRequest(cookie, query),
        authWithActiveWorkspace("workspace-a"),
        env
      );
      expect(response.headers.get("Set-Cookie")).toContain(
        "cloudstash_mcp_consent=; Max-Age=0"
      );
    })
  );

  it.effect("does not bind a non-consent response", () =>
    Effect.gen(function* () {
      const response = yield* bindConsentWorkspace(
        Response.json({ ok: true }),
        new Request("https://cloudstash.test/api/auth/oauth2/authorize"),
        authWithActiveWorkspace("workspace-a"),
        env
      );
      expect(response.headers.has("Set-Cookie")).toBe(false);
    })
  );
});
