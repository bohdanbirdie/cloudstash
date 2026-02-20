import { type WideEvent } from "./types";

const SERVICE_NAME = "cloudstash-worker";

export const emitWideEvent = (event: WideEvent): void => {
  console.log(JSON.stringify(event));
};

export const emitErrorEvent = (
  requestId: string,
  error: unknown,
  context?: Record<string, unknown>
): void => {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      requestId,
      service: SERVICE_NAME,
      level: "error",
      error:
        error instanceof Error
          ? { type: error.name, message: error.message }
          : { type: "Unknown", message: String(error) },
      ...context,
    })
  );
};

export const emitDebugEvent = (
  requestId: string,
  message: string,
  context?: Record<string, unknown>
): void => {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      requestId,
      service: SERVICE_NAME,
      level: "debug",
      message,
      ...context,
    })
  );
};
