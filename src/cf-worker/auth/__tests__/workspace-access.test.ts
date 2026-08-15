import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import type { Auth } from "..";
import { ApiKey, OrgId } from "../../db/branded";
import { makeWorkspaceAccess } from "../workspace-access";

interface AccessState {
  readonly approved?: boolean;
  readonly member?: boolean;
  readonly sessionOrgId?: string | null;
  readonly sessionUserId?: string;
  readonly sessionValid?: boolean;
  readonly keyOrgId?: string | null;
  readonly keyReferenceId?: string | null;
  readonly keyValid?: boolean;
  readonly getSessionError?: unknown;
  readonly verifyApiKeyError?: unknown;
  readonly lookupUserError?: unknown;
  readonly lookupMembershipError?: unknown;
}

const makeAccess = (state: AccessState = {}) =>
  makeWorkspaceAccess(
    {
      api: {
        getSession: () =>
          state.getSessionError
            ? Promise.reject(state.getSessionError)
            : Promise.resolve(
                state.sessionValid === false
                  ? null
                  : {
                      session: {
                        activeOrganizationId:
                          state.sessionOrgId === undefined
                            ? "org-1"
                            : state.sessionOrgId,
                      },
                      user: { id: state.sessionUserId ?? "user-1" },
                    }
              ),
        verifyApiKey: () =>
          state.verifyApiKeyError
            ? Promise.reject(state.verifyApiKeyError)
            : Promise.resolve({
                valid: state.keyValid ?? true,
                key:
                  state.keyValid === false
                    ? null
                    : {
                        metadata:
                          state.keyOrgId === null
                            ? null
                            : { orgId: state.keyOrgId ?? "org-1" },
                        referenceId:
                          state.keyReferenceId === undefined
                            ? "user-1"
                            : state.keyReferenceId,
                      },
              }),
      },
    } as unknown as Auth,
    {
      query: {
        user: {
          findFirst: () =>
            state.lookupUserError
              ? Promise.reject(state.lookupUserError)
              : Promise.resolve(
                  state.approved === false
                    ? { approved: false }
                    : { approved: true }
                ),
        },
        member: {
          findFirst: () =>
            state.lookupMembershipError
              ? Promise.reject(state.lookupMembershipError)
              : Promise.resolve(
                  state.member === false ? undefined : { id: "member-1" }
                ),
        },
      },
    } as never
  );

describe("WorkspaceAccess", () => {
  it.effect("authorizes an approved session with current membership", () => {
    const access = makeAccess();
    return access
      .authorize(
        { _tag: "Session", headers: new Headers() },
        OrgId.make("org-1")
      )
      .pipe(
        Effect.tap((authorization) =>
          Effect.sync(() =>
            expect(authorization).toEqual({
              orgId: "org-1",
              userId: "user-1",
            })
          )
        )
      );
  });

  it.effect("authorizes an API key from its server-stamped scope", () => {
    const access = makeAccess();
    return access
      .authorize({
        _tag: "ApiKey",
        apiKey: ApiKey.make("key-1"),
      })
      .pipe(
        Effect.tap((authorization) =>
          Effect.sync(() =>
            expect(authorization).toEqual({
              orgId: "org-1",
              userId: "user-1",
            })
          )
        )
      );
  });

  it.effect("rejects a requested workspace outside credential scope", () =>
    makeAccess()
      .authorize(
        { _tag: "ApiKey", apiKey: ApiKey.make("key-1") },
        OrgId.make("org-2")
      )
      .pipe(
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() =>
            expect(error._tag).toBe("WorkspaceScopeMismatchError")
          )
        )
      )
  );

  it.effect("rejects an API key without a user reference", () =>
    makeAccess({ keyReferenceId: null })
      .authorize({ _tag: "ApiKey", apiKey: ApiKey.make("key-1") })
      .pipe(
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() =>
            expect(error._tag).toBe("WorkspaceApiKeyReferenceMissingError")
          )
        )
      )
  );

  it.effect("rejects invalid or unscoped credentials", () =>
    Effect.forEach(
      [
        {
          access: makeAccess({ sessionValid: false }),
          credential: {
            _tag: "Session" as const,
            headers: new Headers(),
          },
          expectedTag: "WorkspaceCredentialInvalidError",
        },
        {
          access: makeAccess({ sessionOrgId: null }),
          credential: {
            _tag: "Session" as const,
            headers: new Headers(),
          },
          expectedTag: "WorkspaceScopeMissingError",
        },
        {
          access: makeAccess({ keyValid: false }),
          credential: {
            _tag: "ApiKey" as const,
            apiKey: ApiKey.make("key-1"),
          },
          expectedTag: "WorkspaceCredentialInvalidError",
        },
        {
          access: makeAccess({ keyOrgId: null }),
          credential: {
            _tag: "ApiKey" as const,
            apiKey: ApiKey.make("key-1"),
          },
          expectedTag: "WorkspaceScopeMissingError",
        },
      ],
      ({ access, credential, expectedTag }) =>
        access.authorize(credential).pipe(
          Effect.flip,
          Effect.tap((error) =>
            Effect.sync(() => expect(error._tag).toBe(expectedTag))
          )
        ),
      { discard: true }
    )
  );

  it.effect("classifies backend failures by operation", () =>
    Effect.forEach(
      [
        {
          access: makeAccess({ getSessionError: new Error("auth down") }),
          credential: {
            _tag: "Session" as const,
            headers: new Headers(),
          },
          operation: "getSession",
        },
        {
          access: makeAccess({ verifyApiKeyError: new Error("auth down") }),
          credential: {
            _tag: "ApiKey" as const,
            apiKey: ApiKey.make("key-1"),
          },
          operation: "verifyApiKey",
        },
        {
          access: makeAccess({ lookupUserError: new Error("D1 down") }),
          credential: {
            _tag: "Session" as const,
            headers: new Headers(),
          },
          operation: "lookupUser",
        },
        {
          access: makeAccess({
            lookupMembershipError: new Error("D1 down"),
          }),
          credential: {
            _tag: "ApiKey" as const,
            apiKey: ApiKey.make("key-1"),
          },
          operation: "lookupMembership",
        },
      ] as const,
      ({ access, credential, operation }) =>
        access.authorize(credential).pipe(
          Effect.flip,
          Effect.tap((error) =>
            Effect.sync(() => {
              expect(error._tag).toBe("WorkspaceAccessBackendError");
              if (error._tag === "WorkspaceAccessBackendError") {
                expect(error.operation).toBe(operation);
              }
            })
          )
        ),
      { discard: true }
    )
  );

  it.effect("rejects a user whose approval was withdrawn", () =>
    makeAccess({ approved: false })
      .authorize({ _tag: "Session", headers: new Headers() })
      .pipe(
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() =>
            expect(error._tag).toBe("WorkspaceUserUnapprovedError")
          )
        )
      )
  );

  it.effect("rejects a user whose membership was revoked", () =>
    makeAccess({ member: false })
      .authorize({ _tag: "ApiKey", apiKey: ApiKey.make("key-1") })
      .pipe(
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() =>
            expect(error._tag).toBe("WorkspaceMembershipRevokedError")
          )
        )
      )
  );
});
