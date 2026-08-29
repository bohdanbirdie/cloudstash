import { layerProtocolDurableObject } from "@livestore/common-cf";
import { Cause, Effect } from "effect";
import type { Scope } from "effect";
import { RpcClient, RpcClientError } from "effect/unstable/rpc";

import type {
  GetLinkInput,
  ListLinksInput,
  SearchLinksInput,
  UpdateLinkInput,
  UpdateLinksInput,
} from "../../lib/links-contract";
import { safeErrorInfo } from "../log-utils";
import {
  WorkspaceLinksRemoteError,
  WorkspaceLinksRpcs,
} from "../workspace-links/effect-rpc";
import type { SaveLinkRpcInput } from "../workspace-links/rpc";

type WorkspaceLinksClient = RpcClient.FromGroup<
  typeof WorkspaceLinksRpcs,
  RpcClientError.RpcClientError
>;
type MakeWorkspaceLinksClient = Effect.Effect<
  WorkspaceLinksClient,
  never,
  Scope.Scope
>;

export const makeChatLibraryFromClient = (
  makeClient: MakeWorkspaceLinksClient
) => {
  const failUnavailable = Effect.fnUntraced(function* (cause: unknown) {
    yield* Effect.logWarning("Workspace link RPC unavailable").pipe(
      Effect.annotateLogs(safeErrorInfo(cause))
    );
    return yield* new WorkspaceLinksRemoteError({
      code: "unavailable",
      message: "Library is unavailable",
    });
  });

  const invoke = <Value>(
    operation: (
      client: WorkspaceLinksClient
    ) => Effect.Effect<
      Value,
      WorkspaceLinksRemoteError | RpcClientError.RpcClientError
    >
  ) =>
    Effect.scoped(Effect.flatMap(makeClient, operation)).pipe(
      Effect.catchTag("RpcClientError", failUnavailable),
      Effect.catchDefect((defect) =>
        Cause.isUnknownError(defect)
          ? failUnavailable(defect.cause)
          : Effect.die(defect)
      )
    );

  return {
    get: Effect.fnUntraced(function* (input: GetLinkInput) {
      return yield* invoke((client) => client.GetLink(input));
    }),
    list: Effect.fnUntraced(function* (input: ListLinksInput) {
      return yield* invoke((client) => client.ListLinks(input));
    }),
    save: Effect.fnUntraced(function* (input: SaveLinkRpcInput) {
      return yield* invoke((client) => client.SaveLink(input));
    }),
    search: Effect.fnUntraced(function* (input: SearchLinksInput) {
      return yield* invoke((client) => client.SearchLinks(input));
    }),
    stats: Effect.fnUntraced(function* () {
      return yield* invoke((client) => client.GetLinkStats({}));
    }),
    update: Effect.fnUntraced(function* (input: UpdateLinkInput) {
      return yield* invoke((client) => client.UpdateLink(input));
    }),
    updateMany: Effect.fnUntraced(function* (input: UpdateLinksInput) {
      return yield* invoke((client) => client.UpdateLinks(input));
    }),
  };
};

export const makeChatLibrary = ({
  callRpc,
  durableObjectId,
}: {
  readonly callRpc: (
    payload: Uint8Array
  ) => Promise<Uint8Array | ReadableStream>;
  readonly durableObjectId: string;
}) =>
  makeChatLibraryFromClient(
    RpcClient.make(WorkspaceLinksRpcs).pipe(
      Effect.provide(
        layerProtocolDurableObject({
          callRpc,
          callerContext: {
            bindingName: "LINK_PROCESSOR_DO",
            durableObjectId,
          },
        })
      )
    )
  );

export type ChatLibrary = ReturnType<typeof makeChatLibraryFromClient>;
