import { Context } from "effect";
import type { Effect } from "effect";

import type { DigestId } from "../db/branded";
import { DigestEventSinkError, DigestLinkSourceError } from "./errors";
import type { DigestLinkInput } from "./generator";

export interface DigestCommitParams {
  readonly id: DigestId;
  readonly period: string;
  readonly contentMd: string;
  readonly generatedAt: Date;
}

export class DigestLinkSource extends Context.Service<
  DigestLinkSource,
  {
    readonly collect: (
      cutoffMs: number
    ) => Effect.Effect<ReadonlyArray<DigestLinkInput>, DigestLinkSourceError>;
  }
>()("@cloudstash/DigestLinkSource") {}

export class DigestEventSink extends Context.Service<
  DigestEventSink,
  {
    readonly commit: (
      params: DigestCommitParams
    ) => Effect.Effect<void, DigestEventSinkError>;
  }
>()("@cloudstash/DigestEventSink") {}
