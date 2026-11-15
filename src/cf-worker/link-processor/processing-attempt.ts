import { Effect, Schema } from "effect";

export const ProcessingAttempt = Schema.Struct({
  id: Schema.String,
  isReprocess: Schema.Boolean,
});
export type ProcessingAttempt = typeof ProcessingAttempt.Type;

export class ProcessingAttemptStorageError extends Schema.TaggedError<ProcessingAttemptStorageError>()(
  "ProcessingAttemptStorageError",
  {
    operation: Schema.Literals(["read-or-create", "read-status", "delete"]),
    cause: Schema.Defect(),
  }
) {}

export const processingAttemptKey = (linkId: string) =>
  `link-processing-attempt:${linkId}`;

export const getOrCreateProcessingAttempt = Effect.fnUntraced(function* (
  storage: DurableObjectStorage,
  linkId: string,
  isReprocess: boolean
) {
  return yield* Effect.tryPromise({
    try: () =>
      storage.transaction(async (transaction) => {
        const key = processingAttemptKey(linkId);
        const stored = await transaction.get(key);
        if (stored !== undefined) {
          return Schema.decodeUnknownPromise(ProcessingAttempt)(stored);
        }
        const attempt = ProcessingAttempt.make({
          id: `${isReprocess ? "reprocess" : "initial"}:${linkId}:${crypto.randomUUID()}`,
          isReprocess,
        });
        await transaction.put(key, attempt);
        return attempt;
      }),
    catch: (cause) =>
      new ProcessingAttemptStorageError({
        operation: "read-or-create",
        cause,
      }),
  }).pipe(Effect.orDie);
});
