import { XSyncSideEffectError } from "./errors";

export const sideEffectError =
  (op: string) =>
  (cause: unknown): XSyncSideEffectError =>
    new XSyncSideEffectError({ op, cause });
