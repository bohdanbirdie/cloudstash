import { Cause, Effect, Exit, Layer, ManagedRuntime, Option } from "effect";

import { PopupLayer } from "./layers";

const popupRuntime = ManagedRuntime.make(PopupLayer);

type ContextOfLayer<L> =
  L extends Layer.Layer<infer R, infer _E, infer _RIn> ? R : never;
export type PopupContext = ContextOfLayer<typeof PopupLayer>;

/** Fire-and-forget runner for popup side effects (persist creds, open connect). */
export const runPopup = <A, E>(
  eff: Effect.Effect<A, E, PopupContext>
): void => {
  void popupRuntime.runPromiseExit(eff).then((exit) => {
    if (Exit.isFailure(exit) && !Cause.isInterruptedOnly(exit.cause)) {
      console.error("[popup] effect failed", Cause.pretty(exit.cause));
    }
  });
};

export type EffectState<A, E> =
  | { status: "loading" }
  | { status: "ok"; value: A }
  | { status: "error"; error: E | Cause.Cause<E> };

/** Runs an effect to a settled `EffectState` — the async primitive behind the popup data hooks. */
export const runPopupState = <A, E>(
  eff: Effect.Effect<A, E, PopupContext>
): Promise<EffectState<A, E>> =>
  popupRuntime.runPromiseExit(eff).then((exit) =>
    Exit.isSuccess(exit)
      ? { status: "ok", value: exit.value }
      : {
          status: "error",
          error: Option.getOrElse(
            Cause.failureOption(exit.cause),
            () => exit.cause
          ),
        }
  );
