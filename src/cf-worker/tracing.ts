import * as Resource from "@effect/opentelemetry/Resource";
import * as Tracer from "@effect/opentelemetry/Tracer";
import { Layer } from "effect";

const resource = {
  serviceName: "cloudstash-worker",
  serviceVersion: "1.0.0",
};

// Dev OTLP exporter (FetchHttpClient) was triggering "Disallowed operation
// called within global scope" in workerd while we investigate the LP↔SB
// livestore desync. Use the no-op global tracer everywhere until that's
// resolved; flip back when ready to re-enable local OTLP.
export const OtelTracingLive = Tracer.layerGlobal.pipe(
  Layer.provide(Resource.layer(resource))
);
