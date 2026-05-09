import * as OtlpSerialization from "@effect/opentelemetry/OtlpSerialization";
import * as OtlpTracer from "@effect/opentelemetry/OtlpTracer";
import * as Resource from "@effect/opentelemetry/Resource";
import * as Tracer from "@effect/opentelemetry/Tracer";
import { FetchHttpClient } from "@effect/platform";
import { Layer } from "effect";

const resource = {
  serviceName: "cloudstash-worker",
  serviceVersion: "1.0.0",
};

const ProductionTracingLive = Tracer.layerGlobal.pipe(
  Layer.provide(Resource.layer(resource))
);

const DevTracingLive = OtlpTracer.layer({
  url: "http://127.0.0.1:27686/v1/traces",
  resource,
}).pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(OtlpSerialization.layerJson)
);

export const OtelTracingLive = import.meta.env.DEV
  ? DevTracingLive
  : ProductionTracingLive;
