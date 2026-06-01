import { Cause, Effect, Exit, Layer, ManagedRuntime, Option } from "effect";

import { PopupLayer } from "./layers";

const popupRuntime = ManagedRuntime.make(PopupLayer);

export type PopupContext = Layer.Layer.Success<typeof PopupLayer>;

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
