import { FetchHttpClient } from "@effect/platform";
import { OtlpSerialization, OtlpTracer } from "@effect/opentelemetry";
import { Layer } from "effect";

import type { Env } from "./shared";

export const OtelTracingLive = (env: Env) => {
  if (!env.AXIOM_API_TOKEN) {
    return Layer.empty;
  }

  const dataset = env.AXIOM_DATASET ?? "cloudstash-traces";

  return OtlpTracer.layer({
    url: `https://api.axiom.co/v1/traces`,
    headers: {
      Authorization: `Bearer ${env.AXIOM_API_TOKEN}`,
      "X-Axiom-Dataset": dataset,
    },
    resource: {
      serviceName: "cloudstash-worker",
      serviceVersion: "1.0.0",
    },
  }).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(OtlpSerialization.layerJson)
  );
};
