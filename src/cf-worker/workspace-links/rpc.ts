import { Effect, Schema } from "effect";

import {
  GetLinkInput,
  ListLinksInput,
  SaveLinkInput,
  SearchLinksInput,
  UpdateLinkInput,
  UpdateLinksInput,
} from "@/lib/links-contract";

import { WorkspaceLinkInvalidInputError } from "./errors";
import type {
  WorkspaceLinkDomainError,
  WorkspaceLinkInfrastructureError,
} from "./errors";
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
  links: WorkspaceLinks,
  contract: S,
  input: unknown,
  operation: (
    links: WorkspaceLinks,
    value: S["Type"]
  ) => Effect.Effect<
    Value,
    WorkspaceLinkDomainError | WorkspaceLinkInfrastructureError
  >
) {
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
  list: (links: WorkspaceLinks, input: ListLinksInput) =>
    invoke(links, ListLinksInput, input, (service, value) =>
      service.list(value)
    ),

  search: (links: WorkspaceLinks, input: SearchLinksInput) =>
    invoke(links, SearchLinksInput, input, (service, value) =>
      service.search(value)
    ),

  get: (links: WorkspaceLinks, input: GetLinkInput) =>
    invoke(links, GetLinkInput, input, (service, value) =>
      service.get(value.id)
    ),

  save: (links: WorkspaceLinks, input: SaveLinkRpcInput) =>
    invoke(links, SaveLinkRpcInputSchema, input, (service, value) =>
      service.save(value)
    ),

  update: (links: WorkspaceLinks, input: UpdateLinkInput) =>
    invoke(links, UpdateLinkInput, input, (service, value) =>
      service.update(value)
    ),

  updateMany: (links: WorkspaceLinks, input: UpdateLinksInput) =>
    invoke(links, UpdateLinksInput, input, (service, value) =>
      service.updateMany(value)
    ),
};
