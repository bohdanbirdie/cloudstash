import { Data } from "effect";

import type { LinkId } from "../db/branded";

export class WorkspaceLinkNotFoundError extends Data.TaggedError(
  "WorkspaceLinkNotFoundError"
)<{ readonly linkId: LinkId; readonly message: string }> {
  constructor({
    linkId,
    message = "Link not found",
  }: {
    readonly linkId: LinkId;
    readonly message?: string;
  }) {
    super({ linkId, message });
  }
}

export class WorkspaceLinkInvalidInputError extends Data.TaggedError(
  "WorkspaceLinkInvalidInputError"
)<{ readonly message: string }> {}

export class WorkspaceLinkUnavailableError extends Data.TaggedError(
  "WorkspaceLinkUnavailableError"
)<{ readonly message: string }> {
  constructor({
    message = "Workspace is unavailable",
  }: { readonly message?: string } = {}) {
    super({ message });
  }
}

export class WorkspaceLinkStoreError extends Data.TaggedError(
  "WorkspaceLinkStoreError"
)<{
  readonly operation: string;
  readonly message: string;
  readonly cause: unknown;
}> {
  constructor({
    operation,
    cause,
    message = "Workspace link storage failed",
  }: {
    readonly operation: string;
    readonly cause: unknown;
    readonly message?: string;
  }) {
    super({ operation, cause, message });
  }
}

export class WorkspaceLinkSyncError extends Data.TaggedError(
  "WorkspaceLinkSyncError"
)<{ readonly operation: string; readonly message: string }> {
  constructor({
    operation,
    message = "Link changes were not confirmed durable",
  }: {
    readonly operation: string;
    readonly message?: string;
  }) {
    super({ operation, message });
  }
}

export type WorkspaceLinkDomainError =
  | WorkspaceLinkNotFoundError
  | WorkspaceLinkInvalidInputError
  | WorkspaceLinkUnavailableError;

export type WorkspaceLinkInfrastructureError =
  | WorkspaceLinkStoreError
  | WorkspaceLinkSyncError;
