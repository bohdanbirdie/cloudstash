import { Effect, Schema } from "effect";

import { schema } from "../../livestore/schema";
import type { PushEvent } from "./activity";

export class InvalidPushedEventError extends Schema.TaggedError<InvalidPushedEventError>()(
  "InvalidPushedEventError",
  { event: Schema.String, reason: Schema.String }
) {}

/**
 * Rejects a push holding an event this server's schema cannot read: an unknown
 * or client-only event, or args that do not decode. Accepting one would store
 * it in the canonical eventlog, and every client that later replays it would
 * fail to materialize. The reason names the problem, never the payload.
 */
export const validatePushedEvents = Effect.fn(
  "SyncBackend.validatePushedEvents"
)(function* (batch: readonly PushEvent[]) {
  for (const event of batch) {
    const def = schema.eventsDefsMap.get(event.name);
    if (def === undefined) {
      return yield* new InvalidPushedEventError({
        event: event.name,
        reason: "unknown event",
      });
    }
    if (def.options.clientOnly) {
      return yield* new InvalidPushedEventError({
        event: event.name,
        reason: "client-only event",
      });
    }
    yield* Schema.decodeUnknownEffect(def.schema)(event.args).pipe(
      Effect.mapError(
        () =>
          new InvalidPushedEventError({
            event: event.name,
            reason: "args do not match the event schema",
          })
      )
    );
  }
});
