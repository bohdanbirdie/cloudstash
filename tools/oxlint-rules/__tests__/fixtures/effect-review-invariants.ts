import { Effect as Fx, Layer as FxLayer } from "effect";

import { AppLayerLive as AppLayer } from "../auth/service";
import { AppLayerLive as UnrelatedAppLayer } from "unrelated/auth/service";

declare const env: unknown;
declare const operation: { pipe: (...steps: unknown[]) => unknown };

FxLayer.provide(AppLayer(env));

FxLayer.provideMerge(AppLayer(env));
FxLayer.provide(UnrelatedAppLayer(env));

function useLocalLayer(FxLayer: { provide: (layer: unknown) => unknown }) {
  return FxLayer.provide(AppLayer(env));
}

operation.pipe(
  Fx.withSpan("bad-catch-tag"),
  Fx.catchTag("CapabilityDisabledError", () => Fx.void)
);

operation.pipe(
  Fx.withSpan("bad-catch-tags"),
  Fx.catchTags({ CapabilityDisabledError: () => Fx.void })
);

operation.pipe(
  Fx.catchTag("CapabilityDisabledError", () => Fx.void),
  Fx.withSpan("expected-denial-recovered")
);

operation.pipe(
  Fx.withSpan("infrastructure-failure"),
  Fx.catchTag("DbError", () => Fx.void)
);

function useLocalEffect(Fx: {
  catchTag: (tag: string, handler: () => unknown) => unknown;
  withSpan: (name: string) => unknown;
}) {
  return operation.pipe(
    Fx.withSpan("local-effect"),
    Fx.catchTag("CapabilityDisabledError", () => undefined)
  );
}

void useLocalEffect;
void useLocalLayer;
