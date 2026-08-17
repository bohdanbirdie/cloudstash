import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import {
  WorkspaceAccessBackendError,
  WorkspaceCredentialInvalidError,
  WorkspaceMembershipRevokedError,
  WorkspaceScopeMismatchError,
  WorkspaceScopeMissingError,
  WorkspaceUserUnapprovedError,
} from "../../auth/workspace-access";
import type { WorkspaceAccess } from "../../auth/workspace-access";
import { OrgId, UserId } from "../../db/branded";
import { getAuthorizedSession } from "../services";

const ORG_ID = OrgId.make("org-1");
const USER_ID = UserId.make("user-1");

const accessReturning = (
  effect: ReturnType<WorkspaceAccess["Service"]["authorizeSession"]>
): WorkspaceAccess["Service"] => ({
  authorizeIdentity: () => Effect.die("Identity authorization not used"),
  authorizeSession: () => effect,
  authorizeApiKey: () => Effect.die("API-key authorization not used"),
});

describe("getAuthorizedSession", () => {
  it.effect("returns the currently authorized user and workspace", () =>
    getAuthorizedSession(
      accessReturning(Effect.succeed({ orgId: ORG_ID, userId: USER_ID })),
      new Headers()
    ).pipe(
      Effect.tap((session) =>
        Effect.sync(() =>
          expect(session).toEqual({ orgId: "org-1", userId: "user-1" })
        )
      )
    )
  );

  it.effect("collapses authorization denials to an absent session", () =>
    Effect.forEach(
      [
        new WorkspaceCredentialInvalidError({ credential: "session" }),
        new WorkspaceScopeMissingError({ credential: "session" }),
        new WorkspaceScopeMismatchError({
          authorizedOrgId: ORG_ID,
          requestedOrgId: OrgId.make("org-2"),
        }),
        new WorkspaceUserUnapprovedError({ userId: USER_ID }),
        new WorkspaceMembershipRevokedError({
          orgId: ORG_ID,
          userId: USER_ID,
        }),
      ],
      (error) =>
        getAuthorizedSession(
          accessReturning(Effect.fail(error)),
          new Headers()
        ).pipe(
          Effect.tap((session) => Effect.sync(() => expect(session).toBeNull()))
        ),
      { discard: true }
    )
  );

  it.effect("maps backend failures to SessionLookupError", () => {
    const cause = new Error("D1 unavailable");
    return getAuthorizedSession(
      accessReturning(
        Effect.fail(
          new WorkspaceAccessBackendError({
            cause,
            operation: "lookupMembership",
          })
        )
      ),
      new Headers()
    ).pipe(
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error._tag).toBe("SessionLookupError");
          expect(error.cause).toBe(cause);
        })
      )
    );
  });
});
