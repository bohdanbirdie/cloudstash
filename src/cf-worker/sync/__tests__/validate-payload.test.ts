import { describe, expect, it } from "@effect/vitest";
import { Effect, Either, Layer } from "effect";

import { AuthClient } from "../../auth/service";
import { OrgId } from "../../db/branded";
import { parseExtensionAllowlist, validatePayload } from "../validate-payload";

type VerifyApiKeyResult = {
  valid: boolean;
  key: {
    referenceId: string | null;
    metadata: unknown;
  } | null;
};
type SessionResult = {
  user: { id: string };
  session: { activeOrganizationId: string | null };
} | null;

const STORE = OrgId.make("org-1");
const headersWith = (entries: Record<string, string>) => {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(entries)) map.set(k, v);
  return map as ReadonlyMap<string, string>;
};

function makeAuthLayer(stub: {
  verifyApiKey?: () =>
    | Promise<VerifyApiKeyResult>
    | (() => Promise<VerifyApiKeyResult>);
  getSession?: () => Promise<SessionResult> | (() => Promise<SessionResult>);
}) {
  return Layer.succeed(AuthClient, {
    api: {
      verifyApiKey:
        stub.verifyApiKey ??
        (() =>
          Promise.resolve<VerifyApiKeyResult>({ valid: false, key: null })),
      getSession: stub.getSession ?? (() => Promise.resolve(null)),
    },
  } as unknown as AuthClient["Type"]);
}

const NO_ALLOWLIST = new Set<string>();
const CTX_EXT = {
  storeId: STORE,
  headers: headersWith({ origin: "chrome-extension://abc" }),
  allowedExtensionIds: NO_ALLOWLIST,
};
const CTX_COOKIE = {
  storeId: STORE,
  headers: headersWith({ cookie: "session=xyz" }),
  allowedExtensionIds: NO_ALLOWLIST,
};
const CTX_NO_AUTH = {
  storeId: STORE,
  headers: headersWith({}),
  allowedExtensionIds: NO_ALLOWLIST,
};

describe("validatePayload — extension API key path", () => {
  it.effect("InvalidSessionError when payload missing apiKey", () =>
    validatePayload({}, CTX_EXT).pipe(
      Effect.either,
      Effect.provide(makeAuthLayer({})),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left._tag).toBe("InvalidSessionError");
          }
        })
      )
    )
  );

  it.effect("AuthBackendError when verifyApiKey throws", () =>
    validatePayload({ apiKey: "lb_k" }, CTX_EXT).pipe(
      Effect.either,
      Effect.provide(
        makeAuthLayer({
          verifyApiKey: () => Promise.reject(new Error("upstream 502")),
        })
      ),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left._tag).toBe("AuthBackendError");
          }
        })
      )
    )
  );

  it.effect("InvalidSessionError when verify returns valid=false", () =>
    validatePayload({ apiKey: "lb_k" }, CTX_EXT).pipe(
      Effect.either,
      Effect.provide(
        makeAuthLayer({
          verifyApiKey: () => Promise.resolve({ valid: false, key: null }),
        })
      ),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left._tag).toBe("InvalidSessionError");
          }
        })
      )
    )
  );

  it.effect("InvalidSessionError when metadata missing orgId", () =>
    validatePayload({ apiKey: "lb_k" }, CTX_EXT).pipe(
      Effect.either,
      Effect.provide(
        makeAuthLayer({
          verifyApiKey: () =>
            Promise.resolve({
              valid: true,
              key: { referenceId: "user-1", metadata: null },
            }),
        })
      ),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left._tag).toBe("InvalidSessionError");
          }
        })
      )
    )
  );

  it.effect("OrgAccessDeniedError when metadata.orgId != storeId", () =>
    validatePayload({ apiKey: "lb_k" }, CTX_EXT).pipe(
      Effect.either,
      Effect.provide(
        makeAuthLayer({
          verifyApiKey: () =>
            Promise.resolve({
              valid: true,
              key: {
                referenceId: "user-1",
                metadata: { orgId: "wrong-org" },
              },
            }),
        })
      ),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left._tag).toBe("OrgAccessDeniedError");
          }
        })
      )
    )
  );

  it.effect("MissingApiKeyReferenceError when referenceId is null", () =>
    validatePayload({ apiKey: "lb_k" }, CTX_EXT).pipe(
      Effect.either,
      Effect.provide(
        makeAuthLayer({
          verifyApiKey: () =>
            Promise.resolve({
              valid: true,
              key: { referenceId: null, metadata: { orgId: STORE } },
            }),
        })
      ),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left._tag).toBe("MissingApiKeyReferenceError");
          }
        })
      )
    )
  );

  it.effect("success returns branded userId", () =>
    validatePayload({ apiKey: "lb_k" }, CTX_EXT).pipe(
      Effect.provide(
        makeAuthLayer({
          verifyApiKey: () =>
            Promise.resolve({
              valid: true,
              key: { referenceId: "user-7", metadata: { orgId: STORE } },
            }),
        })
      ),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result.userId).toBe("user-7");
        })
      )
    )
  );
});

describe("validatePayload — extension origin allowlist", () => {
  const okAuth = () =>
    makeAuthLayer({
      verifyApiKey: () =>
        Promise.resolve({
          valid: true,
          key: { referenceId: "user-7", metadata: { orgId: STORE } },
        }),
    });

  it.effect("allowlisted origin passes through", () =>
    validatePayload(
      { apiKey: "lb_k" },
      {
        storeId: STORE,
        headers: headersWith({ origin: "chrome-extension://abc" }),
        allowedExtensionIds: new Set(["abc"]),
      }
    ).pipe(
      Effect.provide(okAuth()),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result.userId).toBe("user-7");
        })
      )
    )
  );

  it.effect("non-allowlisted origin is rejected before key check", () =>
    validatePayload(
      { apiKey: "lb_k" },
      {
        storeId: STORE,
        headers: headersWith({ origin: "chrome-extension://evil" }),
        allowedExtensionIds: new Set(["abc"]),
      }
    ).pipe(
      Effect.either,
      Effect.provide(okAuth()),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left._tag).toBe("ForbiddenExtensionOriginError");
          }
        })
      )
    )
  );

  // Locks the deliberate fail-open: an EMPTY allowlist (the default when
  // EXTENSION_ID_ALLOWLIST is unset) intentionally skips the origin check and
  // proceeds straight to API-key verification. If this ever flips to
  // default-deny, this test must be updated on purpose, not broken silently.
  it.effect(
    "empty allowlist lets any extension origin reach the key check",
    () =>
      validatePayload(
        { apiKey: "lb_k" },
        {
          storeId: STORE,
          headers: headersWith({ origin: "chrome-extension://unlisted" }),
          allowedExtensionIds: NO_ALLOWLIST,
        }
      ).pipe(
        Effect.either,
        Effect.provide(okAuth()),
        Effect.tap((result) =>
          Effect.sync(() => {
            expect(Either.isRight(result)).toBe(true);
            if (Either.isRight(result)) {
              expect(result.right.userId).toBe("user-7");
            }
          })
        )
      )
  );
});

describe("parseExtensionAllowlist", () => {
  it("empty string yields empty set", () => {
    expect(parseExtensionAllowlist("").size).toBe(0);
    expect(parseExtensionAllowlist(undefined).size).toBe(0);
  });

  it("normalizes scheme, trailing slash, and whitespace", () => {
    const set = parseExtensionAllowlist(
      " chrome-extension://abc/ , def ,, ghi "
    );
    expect([...set].toSorted()).toEqual(["abc", "def", "ghi"]);
  });
});

describe("validatePayload — cookie path", () => {
  it.effect(
    "MissingSessionCookieError when no cookie and no extension origin",
    () =>
      validatePayload(undefined, CTX_NO_AUTH).pipe(
        Effect.either,
        Effect.provide(makeAuthLayer({})),
        Effect.tap((result) =>
          Effect.sync(() => {
            expect(Either.isLeft(result)).toBe(true);
            if (Either.isLeft(result)) {
              expect(result.left._tag).toBe("MissingSessionCookieError");
            }
          })
        )
      )
  );

  it.effect("AuthBackendError when getSession throws", () =>
    validatePayload(undefined, CTX_COOKIE).pipe(
      Effect.either,
      Effect.provide(
        makeAuthLayer({
          getSession: () => Promise.reject(new Error("auth backend down")),
        })
      ),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left._tag).toBe("AuthBackendError");
          }
        })
      )
    )
  );

  it.effect("InvalidSessionError when session is null", () =>
    validatePayload(undefined, CTX_COOKIE).pipe(
      Effect.either,
      Effect.provide(
        makeAuthLayer({
          getSession: () => Promise.resolve(null),
        })
      ),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left._tag).toBe("InvalidSessionError");
          }
        })
      )
    )
  );

  it.effect("OrgAccessDeniedError when activeOrganizationId != storeId", () =>
    validatePayload(undefined, CTX_COOKIE).pipe(
      Effect.either,
      Effect.provide(
        makeAuthLayer({
          getSession: () =>
            Promise.resolve({
              user: { id: "user-1" },
              session: { activeOrganizationId: "other-org" },
            }),
        })
      ),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left._tag).toBe("OrgAccessDeniedError");
          }
        })
      )
    )
  );

  it.effect("success returns branded userId from session", () =>
    validatePayload(undefined, CTX_COOKIE).pipe(
      Effect.provide(
        makeAuthLayer({
          getSession: () =>
            Promise.resolve({
              user: { id: "user-1" },
              session: { activeOrganizationId: STORE },
            }),
        })
      ),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result.userId).toBe("user-1");
        })
      )
    )
  );

  // Precedence guard: a request carrying BOTH a cookie and a chrome-extension
  // origin must take the cookie/session path (the extension branch requires
  // `!cookie`). verifyApiKey is wired to throw — if precedence ever inverts and
  // the extension branch wins, this surfaces as AuthBackendError instead of the
  // session userId, failing the test loudly.
  it.effect("cookie takes precedence over an extension origin", () =>
    validatePayload(
      { apiKey: "lb_k" },
      {
        storeId: STORE,
        headers: headersWith({
          cookie: "session=xyz",
          origin: "chrome-extension://abc",
        }),
        allowedExtensionIds: NO_ALLOWLIST,
      }
    ).pipe(
      Effect.provide(
        makeAuthLayer({
          verifyApiKey: () => Promise.reject(new Error("must not be called")),
          getSession: () =>
            Promise.resolve({
              user: { id: "user-cookie" },
              session: { activeOrganizationId: STORE },
            }),
        })
      ),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result.userId).toBe("user-cookie");
        })
      )
    )
  );
});
