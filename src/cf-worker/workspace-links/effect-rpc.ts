import { Effect, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

import {
  GetLinkInput,
  LinkMutableState,
  ListLinksInput,
  SearchLinksInput,
  UpdateLinkInput,
  UpdateLinksInput,
} from "@/lib/links-contract";

import { SaveLinkRpcInputSchema, WorkspaceLinksRpc } from "./rpc";
import type { WorkspaceLinksRpcResult } from "./rpc";
import type { WorkspaceLinks } from "./service";

const ApiLinkProcessing = Schema.Literals([
  "pending",
  "processing",
  "done",
  "failed",
  "none",
]);

const ApiLink = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  title: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  summary: Schema.NullOr(Schema.String),
  domain: Schema.String,
  image: Schema.NullOr(Schema.String),
  favicon: Schema.NullOr(Schema.String),
  tags: Schema.Array(Schema.String),
  state: LinkMutableState,
  processing: ApiLinkProcessing,
  source: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  completedAt: Schema.NullOr(Schema.String),
  deletedAt: Schema.NullOr(Schema.String),
});

const ApiLinksPage = Schema.Struct({
  links: Schema.Array(ApiLink),
  total: Schema.Number,
  nextCursor: Schema.NullOr(Schema.String),
});

const ApiSearchLink = Schema.Struct({
  ...ApiLink.fields,
  score: Schema.Number,
  matchedFields: Schema.Array(Schema.String),
});

const WorkspaceLinkSaveResult = Schema.Struct({
  created: Schema.Boolean,
  link: ApiLink,
});

const WorkspaceLinkStats = Schema.Struct({
  inbox: Schema.Number,
  completed: Schema.Number,
  total: Schema.Number,
});

const WorkspaceLinkBatchUpdateResult = Schema.Struct({
  links: Schema.Array(ApiLink),
  updated: Schema.Number,
  nextCursor: Schema.NullOr(Schema.String),
});

export class WorkspaceLinksRemoteError extends Schema.TaggedErrorClass<WorkspaceLinksRemoteError>()(
  "WorkspaceLinksRemoteError",
  {
    code: Schema.Literals([
      "invalid_input",
      "limit_reached",
      "not_found",
      "unavailable",
    ]),
    message: Schema.String,
    linkId: Schema.optionalKey(Schema.String),
  }
) {}

export class WorkspaceLinksRpcs extends RpcGroup.make(
  Rpc.make("ListLinks", {
    payload: ListLinksInput,
    success: ApiLinksPage,
    error: WorkspaceLinksRemoteError,
  }),
  Rpc.make("SearchLinks", {
    payload: SearchLinksInput,
    success: Schema.Array(ApiSearchLink),
    error: WorkspaceLinksRemoteError,
  }),
  Rpc.make("GetLink", {
    payload: GetLinkInput,
    success: ApiLink,
    error: WorkspaceLinksRemoteError,
  }),
  Rpc.make("SaveLink", {
    payload: SaveLinkRpcInputSchema,
    success: WorkspaceLinkSaveResult,
    error: WorkspaceLinksRemoteError,
  }),
  Rpc.make("UpdateLink", {
    payload: UpdateLinkInput,
    success: ApiLink,
    error: WorkspaceLinksRemoteError,
  }),
  Rpc.make("UpdateLinks", {
    payload: UpdateLinksInput,
    success: WorkspaceLinkBatchUpdateResult,
    error: WorkspaceLinksRemoteError,
  }),
  Rpc.make("GetLinkStats", {
    payload: Schema.Struct({}),
    success: WorkspaceLinkStats,
    error: WorkspaceLinksRemoteError,
  })
) {}

export const unwrapWorkspaceLinksRpcResult = Effect.fnUntraced(function* <
  Value,
>(result: WorkspaceLinksRpcResult<Value>) {
  if (!result.ok) {
    return yield* new WorkspaceLinksRemoteError(result.error);
  }
  return result.value;
});

export interface WorkspaceLinksRpcRunner {
  <Value, Error>(
    operation: (
      links: WorkspaceLinks
    ) => Effect.Effect<WorkspaceLinksRpcResult<Value>, Error>
  ): Effect.Effect<Value, WorkspaceLinksRemoteError>;
}

export const makeWorkspaceLinksRpcHandlers = (
  run: WorkspaceLinksRpcRunner,
  runSave: WorkspaceLinksRpcRunner = run
) =>
  WorkspaceLinksRpcs.toLayer({
    ListLinks: (input) => run((links) => WorkspaceLinksRpc.list(links, input)),
    SearchLinks: (input) =>
      run((links) => WorkspaceLinksRpc.search(links, input)),
    GetLink: (input) => run((links) => WorkspaceLinksRpc.get(links, input)),
    SaveLink: (input) =>
      runSave((links) => WorkspaceLinksRpc.save(links, input)),
    UpdateLink: (input) =>
      run((links) => WorkspaceLinksRpc.update(links, input)),
    UpdateLinks: (input) =>
      run((links) => WorkspaceLinksRpc.updateMany(links, input)),
    GetLinkStats: () => run((links) => WorkspaceLinksRpc.stats(links)),
  });
