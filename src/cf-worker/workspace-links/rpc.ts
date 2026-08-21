import type { Store } from "@livestore/livestore";
import { Effect, Schema } from "effect";

import {
  GetLinkInput,
  ListLinksInput,
  SaveLinkInput,
  SearchLinksInput,
  UpdateLinkInput,
  UpdateLinksInput,
} from "@/lib/links-contract";
import type { schema } from "@/livestore/schema";

import { WorkspaceLinkInvalidInputError } from "./errors";
import type {
  WorkspaceLinkDomainError,
  WorkspaceLinkInfrastructureError,
} from "./errors";
import { makeWorkspaceLinks } from "./service";
import type { WorkspaceLinks } from "./service";

export type WorkspaceLinksRpcError = {
  readonly code: "invalid_input" | "not_found" | "unavailable";
  readonly message: string;
  readonly linkId?: string;
};

export type WorkspaceLinksRpcResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: WorkspaceLinksRpcError };

export type SaveLinkRpcInput = SaveLinkInput & {
  readonly source: "api" | "mcp";
};

const SaveLinkRpcInputSchema = Schema.Struct({
  ...SaveLinkInput.fields,
  source: Schema.Literals(["api", "mcp"]),
});

const decode = Effect.fnUntraced(function* <S extends Schema.Top>(
  contract: S,
  input: unknown
) {
  return yield* Schema.decodeUnknownEffect(contract, {
    onExcessProperty: "error",
  })(input).pipe(
    Effect.mapError(
      () => new WorkspaceLinkInvalidInputError({ message: "Invalid request" })
    )
  );
});

const domainOutcome = Effect.fnUntraced(function* <Value, Requirements>(
  effect: Effect.Effect<
    Value,
    WorkspaceLinkDomainError | WorkspaceLinkInfrastructureError,
    Requirements
  >
) {
  return yield* effect.pipe(
    Effect.map((value) => ({ ok: true as const, value })),
    Effect.catchTags({
      WorkspaceLinkInvalidInputError: (error) =>
        Effect.succeed({
          ok: false as const,
          error: { code: "invalid_input" as const, message: error.message },
        }),
      WorkspaceLinkNotFoundError: (error) =>
        Effect.succeed({
          ok: false as const,
          error: {
            code: "not_found" as const,
            message: error.message,
            linkId: error.linkId,
          },
        }),
      WorkspaceLinkUnavailableError: (error) =>
        Effect.succeed({
          ok: false as const,
          error: { code: "unavailable" as const, message: error.message },
        }),
    })
  );
});

const invoke = Effect.fnUntraced(function* <
  S extends Schema.Top & { readonly DecodingServices: never },
  Value,
>(
  store: Store<typeof schema>,
  contract: S,
  input: unknown,
  operation: (
    links: WorkspaceLinks,
    value: S["Type"]
  ) => Effect.Effect<
    Value,
    WorkspaceLinkDomainError | WorkspaceLinkInfrastructureError
  >,
  canCommit: () => boolean
) {
  const links = makeWorkspaceLinks(store, { canCommit });
  return yield* domainOutcome(
    decode(contract, input).pipe(
      Effect.flatMap((value) => operation(links, value))
    )
  );
});

/**
 * Typed RPC programs for the workspace owner. The Durable Object supplies its
 * existing materialized store and remains responsible for lifecycle checks.
 */
export const WorkspaceLinksRpc = {
  list: (
    store: Store<typeof schema>,
    input: ListLinksInput,
    canCommit: () => boolean
  ) =>
    invoke(
      store,
      ListLinksInput,
      input,
      (links, value) => links.list(value),
      canCommit
    ),

  search: (
    store: Store<typeof schema>,
    input: SearchLinksInput,
    canCommit: () => boolean
  ) =>
    invoke(
      store,
      SearchLinksInput,
      input,
      (links, value) => links.search(value),
      canCommit
    ),

  get: (
    store: Store<typeof schema>,
    input: GetLinkInput,
    canCommit: () => boolean
  ) =>
    invoke(
      store,
      GetLinkInput,
      input,
      (links, value) => links.get(value.id),
      canCommit
    ),

  save: (
    store: Store<typeof schema>,
    input: SaveLinkRpcInput,
    canCommit: () => boolean
  ) =>
    invoke(
      store,
      SaveLinkRpcInputSchema,
      input,
      (links, value) => links.save(value),
      canCommit
    ),

  update: (
    store: Store<typeof schema>,
    input: UpdateLinkInput,
    canCommit: () => boolean
  ) =>
    invoke(
      store,
      UpdateLinkInput,
      input,
      (links, value) => links.update(value),
      canCommit
    ),

  updateMany: (
    store: Store<typeof schema>,
    input: UpdateLinksInput,
    canCommit: () => boolean
  ) =>
    invoke(
      store,
      UpdateLinksInput,
      input,
      (links, value) => links.updateMany(value),
      canCommit
    ),
};
