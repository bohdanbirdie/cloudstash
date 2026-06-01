import { Cause } from "effect";

type ErrorInfo = {
  readonly errorType: string;
  readonly hasMessage: boolean;
  readonly errorMessage?: string;
  readonly tag?: string;
};

export const safeErrorInfo = (error: unknown): ErrorInfo => {
  if (Cause.isCause(error)) {
    const failureOpt = Cause.failureOption(error);
    if (failureOpt._tag === "Some") return safeErrorInfo(failureOpt.value);
    return { errorType: "Cause", hasMessage: false };
  }
  if (error instanceof Error) {
    return {
      errorType: error.name || "Error",
      hasMessage: !!error.message,
      errorMessage: error.message?.slice(0, 500),
    };
  }
  if (error !== null && typeof error === "object") {
    const tag = (error as { _tag?: unknown })._tag;
    let serialized = "{}";
    try {
      serialized = JSON.stringify(error)?.slice(0, 500) ?? "{}";
    } catch {
      serialized = "{}";
    }
    return {
      errorType: typeof tag === "string" ? tag : "object",
      hasMessage: serialized !== "{}",
      errorMessage: serialized !== "{}" ? serialized : undefined,
      tag: typeof tag === "string" ? tag : undefined,
    };
  }
  return {
    errorType: typeof error,
    hasMessage: false,
  };
};
