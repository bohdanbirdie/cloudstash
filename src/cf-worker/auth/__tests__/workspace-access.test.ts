import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import type { Auth } from "..";
import { ApiKey, OrgId } from "../../db/branded";
import { makeWorkspaceAccess } from "../workspace-access";

interface AccessState {
  readonly approved?: boolean;
  readonly member?: boolean;
  readonly sessionOrgId?: string | null;
  readonly sessionOrgIdOmitted?: boolean;
  readonly sessionUserId?: string;
  readonly sessionValid?: boolean;
  readonly keyOrgId?: string | null;
  readonly keyReferenceId?: string | null;
  readonly keyValid?: boolean;
  readonly getSessionError?: unknown;
  readonly verifyApiKeyError?: unknown;
  readonly lookupUserError?: unknown;
  readonly lookupMembershipError?: unknown;
  readonly sessionResult?: unknown;
  readonly verifyApiKeyResult?: unknown;
}

const makeAccess = (state: AccessState = {}) =>
  makeWorkspaceAccess(
    {
      api: {
        getSession: () =>
          state.getSessionError
            ? Promise.reject(state.getSessionError)
            : state.sessionResult !== undefined
              ? Promise.resolve(state.sessionResult)
              : Promise.resolve(
                  state.sessionValid === false
                    ? null
                    : {
                        session: state.sessionOrgIdOmitted
                          ? {}
                          : {
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
            : state.verifyApiKeyResult !== undefined
              ? Promise.resolve(state.verifyApiKeyResult)
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
    return access.authorizeSession(new Headers(), OrgId.make("org-1")).pipe(
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
    return access.authorizeApiKey(ApiKey.make("key-1")).pipe(
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
      .authorizeApiKey(ApiKey.make("key-1"), OrgId.make("org-2"))
      .pipe(
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() =>
            expect(error._tag).toBe("WorkspaceScopeMismatchError")
          )
        )
      )
  );

  it.effect("rejects an explicitly requested empty workspace", () =>
    makeAccess()
      .authorizeSession(new Headers(), OrgId.make(""))
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
      .authorizeApiKey(ApiKey.make("key-1"))
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
          authorize: () =>
            makeAccess({ sessionValid: false }).authorizeSession(new Headers()),
          expectedTag: "WorkspaceCredentialInvalidError",
        },
        {
          authorize: () =>
            makeAccess({ sessionOrgId: null }).authorizeSession(new Headers()),
          expectedTag: "WorkspaceScopeMissingError",
        },
        {
          authorize: () =>
            makeAccess({ sessionOrgIdOmitted: true }).authorizeSession(
              new Headers()
            ),
          expectedTag: "WorkspaceScopeMissingError",
        },
        {
          authorize: () =>
            makeAccess({ keyValid: false }).authorizeApiKey(
              ApiKey.make("key-1")
            ),
          expectedTag: "WorkspaceCredentialInvalidError",
        },
        {
          authorize: () =>
            makeAccess({ keyOrgId: null }).authorizeApiKey(
              ApiKey.make("key-1")
            ),
          expectedTag: "WorkspaceScopeMissingError",
        },
      ],
      ({ authorize, expectedTag }) =>
        authorize().pipe(
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
          authorize: () =>
            makeAccess({
              getSessionError: new Error("auth down"),
            }).authorizeSession(new Headers()),
          operation: "getSession",
        },
        {
          authorize: () =>
            makeAccess({
              verifyApiKeyError: new Error("auth down"),
            }).authorizeApiKey(ApiKey.make("key-1")),
          operation: "verifyApiKey",
        },
        {
          authorize: () =>
            makeAccess({
              sessionResult: { session: {}, user: {} },
            }).authorizeSession(new Headers()),
          operation: "getSession",
        },
        {
          authorize: () =>
            makeAccess({
              verifyApiKeyResult: { valid: true, key: {} },
            }).authorizeApiKey(ApiKey.make("key-1")),
          operation: "verifyApiKey",
        },
        {
          authorize: () =>
            makeAccess({
              lookupUserError: new Error("D1 down"),
            }).authorizeSession(new Headers()),
          operation: "lookupUser",
        },
        {
          authorize: () =>
            makeAccess({
              lookupMembershipError: new Error("D1 down"),
            }).authorizeApiKey(ApiKey.make("key-1")),
          operation: "lookupMembership",
        },
      ] as const,
      ({ authorize, operation }) =>
        authorize().pipe(
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
      .authorizeSession(new Headers())
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
      .authorizeApiKey(ApiKey.make("key-1"))
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
