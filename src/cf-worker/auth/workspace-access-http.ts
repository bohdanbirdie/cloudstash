import { Effect } from "effect";

import { safeErrorInfo } from "../log-utils";
import { matchWorkspaceAccessError } from "./workspace-access";
import type { WorkspaceAccessError } from "./workspace-access";

const jsonError = (error: string, status: number) =>
  Response.json({ error }, { status });

export const workspaceAccessHttpResponse = Effect.fnUntraced(function* (
  error: WorkspaceAccessError,
  options: {
    readonly missingScope?: () => Response;
    readonly forbidden?: () => Response;
  } = {}
) {
  return yield* matchWorkspaceAccessError(error, {
    unauthorized: () => Effect.succeed(jsonError("Unauthorized", 401)),
    missingScope: () =>
      Effect.succeed(
        options.missingScope?.() ?? jsonError("Unauthorized", 401)
      ),
    forbidden: () =>
      Effect.succeed(options.forbidden?.() ?? jsonError("Forbidden", 403)),
    backend: ({ cause, operation }) =>
      Effect.logError("Workspace authorization backend unavailable").pipe(
        Effect.annotateLogs({ operation, ...safeErrorInfo(cause) }),
        Effect.as(jsonError("Auth backend unavailable", 503))
      ),
  });
});
