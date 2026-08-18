import { makeSignature } from "better-auth/crypto";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { Auth } from "..";
import {
  bindConsentWorkspace,
  validateConsentWorkspaceBinding,
} from "../oauth-consent-binding";

const env = {
  BETTER_AUTH_SECRET: "test-secret-for-oauth-consent-binding-32-chars",
  BETTER_AUTH_URL: "https://cloudstash.test/api/auth",
} as const;

const canonicalize = (params: URLSearchParams): string => {
  const canonical = new URLSearchParams();
  for (const [key, value] of [...params.entries()].toSorted(
    ([keyA, valueA], [keyB, valueB]) =>
      keyA < keyB
        ? -1
        : keyA > keyB
          ? 1
          : valueA < valueB
            ? -1
            : valueA > valueB
              ? 1
              : 0
  )) {
    canonical.append(key, value);
  }
  return canonical.toString();
};

const signedOAuthQuery = async (
  extra: Record<string, string> = {}
): Promise<string> => {
  const params = new URLSearchParams({
    client_id: "mcp-client",
    exp: String(Math.floor(Date.now() / 1000) + 600),
    ...extra,
  });
  const signedNames = [...new Set([...params.keys(), "ba_param"])].toSorted();
  for (const name of signedNames) params.append("ba_param", name);
  params.set(
    "sig",
    await makeSignature(canonicalize(params), env.BETTER_AUTH_SECRET)
  );
  return params.toString();
};

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

const bindWorkspace = async (
  organizationId = "workspace-a",
  options: {
    readonly requestCookie?: string;
    readonly requestPath?: string;
    readonly responseCookie?: string;
    readonly query?: string;
    readonly inspectHeaders?: (headers: Headers) => void;
  } = {}
) => {
  const query = options.query ?? (await signedOAuthQuery());
  const headers = new Headers({
    Location: `https://cloudstash.test/oauth-consent?${query}`,
  });
  if (options.responseCookie) {
    headers.append("Set-Cookie", options.responseCookie);
  }
  const requestHeaders = new Headers();
  if (options.requestCookie) {
    requestHeaders.set("Cookie", options.requestCookie);
  }
  const response = await Effect.runPromise(
    bindConsentWorkspace(
      new Response(null, { headers, status: 302 }),
      new Request(
        `https://cloudstash.test${options.requestPath ?? "/api/auth/oauth2/authorize"}`,
        { headers: requestHeaders }
      ),
      authWithActiveWorkspace(organizationId, options.inspectHeaders),
      env
    )
  );
  const binding = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("cloudstash_mcp_consent="));
  return { cookie: binding?.split(";", 1)[0] ?? "", query, response };
};

const consentRequest = (cookie: string, query: string) =>
  new Request("https://cloudstash.test/api/auth/oauth2/consent", {
    body: JSON.stringify({ accept: true, oauth_query: query }),
    headers: { "Content-Type": "application/json", Cookie: cookie },
    method: "POST",
  });

describe("OAuth consent workspace binding", () => {
  it("binds the request-cookie session on the authorize path", async () => {
    const { cookie } = await bindWorkspace("workspace-a", {
      requestCookie: "better-auth.session_token=request-session",
      inspectHeaders: (headers) => {
        expect(headers.get("cookie")).toContain(
          "better-auth.session_token=request-session"
        );
      },
    });

    expect(cookie).toContain("cloudstash_mcp_consent=");
  });

  it("binds a social callback using its newly created response session", async () => {
    const { cookie, response } = await bindWorkspace("workspace-a", {
      requestPath: "/api/auth/oauth2/callback/google",
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
  });

  it("binds a JSON OAuth resume without consuming its response body", async () => {
    const query = await signedOAuthQuery();
    const response = await Effect.runPromise(
      bindConsentWorkspace(
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
      )
    );

    expect(response.headers.getSetCookie()).toEqual(
      expect.arrayContaining([
        expect.stringContaining("better-auth.session_token=signin-session"),
        expect.stringContaining("cloudstash_mcp_consent="),
      ])
    );
    await expect(response.json()).resolves.toEqual({
      redirect: true,
      url: `https://cloudstash.test/oauth-consent?${query}`,
    });
  });

  it("accepts the signed query and bound workspace", async () => {
    const { cookie, query } = await bindWorkspace();

    await expect(
      Effect.runPromise(
        validateConsentWorkspaceBinding(
          consentRequest(cookie, query),
          authWithActiveWorkspace("workspace-a"),
          env
        )
      )
    ).resolves.toBeNull();
  });

  it("rejects when another tab changes the active workspace", async () => {
    const { cookie, query } = await bindWorkspace("workspace-a");
    const response = await Effect.runPromise(
      validateConsentWorkspaceBinding(
        consentRequest(cookie, query),
        authWithActiveWorkspace("workspace-b"),
        env
      )
    );

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toMatchObject({
      error: "invalid_request",
      error_description: expect.stringContaining("Restart"),
    });
    expect(response?.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("rejects a valid but different signed authorization query", async () => {
    const { cookie } = await bindWorkspace();
    const otherQuery = await signedOAuthQuery({ state: "other" });
    const response = await Effect.runPromise(
      validateConsentWorkspaceBinding(
        consentRequest(cookie, otherQuery),
        authWithActiveWorkspace("workspace-a"),
        env
      )
    );

    expect(response?.status).toBe(400);
  });

  it("rejects a missing binding cookie", async () => {
    const query = await signedOAuthQuery();
    const response = await Effect.runPromise(
      validateConsentWorkspaceBinding(
        consentRequest("", query),
        authWithActiveWorkspace("workspace-a"),
        env
      )
    );

    expect(response?.status).toBe(400);
    expect(response?.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("rejects a tampered binding cookie", async () => {
    const { cookie, query } = await bindWorkspace();
    const response = await Effect.runPromise(
      validateConsentWorkspaceBinding(
        consentRequest(`${cookie.slice(0, -1)}x`, query),
        authWithActiveWorkspace("workspace-a"),
        env
      )
    );

    expect(response?.status).toBe(400);
  });

  it("rejects an expired binding cookie", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-18T12:00:00Z"));
      const { cookie, query } = await bindWorkspace();
      vi.advanceTimersByTime(11 * 60 * 1000);

      const response = await Effect.runPromise(
        validateConsentWorkspaceBinding(
          consentRequest(cookie, query),
          authWithActiveWorkspace("workspace-a"),
          env
        )
      );
      expect(response?.status).toBe(400);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a binding when the session has no active workspace", async () => {
    const { cookie, query } = await bindWorkspace();
    const response = await Effect.runPromise(
      validateConsentWorkspaceBinding(
        consentRequest(cookie, query),
        authWithActiveWorkspace(null),
        env
      )
    );

    expect(response?.status).toBe(400);
  });

  it("does not bind an unsigned consent Location", async () => {
    const { cookie } = await bindWorkspace("workspace-a", {
      query: "client_id=mcp-client&exp=9999999999&sig=forged",
    });

    expect(cookie).toBe("");
  });

  it("clears the bounded binding cookie after consent is submitted", async () => {
    const { cookie, query } = await bindWorkspace();
    const response = await Effect.runPromise(
      bindConsentWorkspace(
        Response.json({ url: "http://127.0.0.1/callback" }),
        consentRequest(cookie, query),
        authWithActiveWorkspace("workspace-a"),
        env
      )
    );

    expect(response.headers.get("Set-Cookie")).toContain(
      "cloudstash_mcp_consent=; Max-Age=0"
    );
  });

  it("does not issue a binding for a non-consent response", async () => {
    const response = await Effect.runPromise(
      bindConsentWorkspace(
        Response.json({ ok: true }),
        new Request("https://cloudstash.test/api/auth/oauth2/authorize"),
        authWithActiveWorkspace("workspace-a"),
        env
      )
    );

    expect(response.headers.has("Set-Cookie")).toBe(false);
  });
});
