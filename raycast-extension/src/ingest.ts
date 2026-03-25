import { Effect } from "effect";

import {
  AuthError,
  ConnectionError,
  InvalidUrlError,
  ValidationError,
} from "./errors";
import { AuthService, HttpService, PreferencesService } from "./services";

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const validateUrl = (
  input: string
): Effect.Effect<string, InvalidUrlError> =>
  Effect.try({
    try: () => {
      new URL(input);
      return input;
    },
    catch: () => new InvalidUrlError({ _tag: "InvalidUrlError", input }),
  });

export const saveUrl = (
  url: string
): Effect.Effect<
  { status: string; domain: string },
  AuthError | ConnectionError | ValidationError,
  AuthService | HttpService | PreferencesService
> =>
  Effect.gen(function* () {
    const auth = yield* AuthService;
    const http = yield* HttpService;
    const prefs = yield* PreferencesService;

    const apiKey = yield* Effect.tryPromise({
      try: () => auth.getApiKey(),
      catch: () => new AuthError({ _tag: "AuthError" }),
    });

    const serverUrl = prefs.serverUrl.replace(/\/$/, "");

    const response = yield* Effect.tryPromise({
      try: () =>
        http.fetch(`${serverUrl}/api/ingest`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url }),
        }),
      catch: () =>
        new ConnectionError({
          _tag: "ConnectionError",
          message: "Network error",
        }),
    });

    if (!response.ok) {
      if (response.status === 400) {
        const error = yield* Effect.tryPromise({
          try: () => response.json() as Promise<{ error?: string }>,
          catch: () =>
            new ConnectionError({
              _tag: "ConnectionError",
              message: "Bad request",
            }),
        });
        return yield* new ValidationError({
          _tag: "ValidationError",
          message: error.error || "Invalid request",
        });
      }
      yield* Effect.tryPromise({
        try: () => auth.clearApiKey(),
        catch: () =>
          new ConnectionError({
            _tag: "ConnectionError",
            message: "Failed to clear token",
          }),
      });
      return yield* new ConnectionError({
        _tag: "ConnectionError",
        message: "Connection lost — run again to reconnect",
      });
    }

    const result = yield* Effect.tryPromise({
      try: () => response.json() as Promise<{ status: string }>,
      catch: () =>
        new ConnectionError({
          _tag: "ConnectionError",
          message: "Invalid response",
        }),
    });

    return { status: result.status, domain: getDomain(url) };
  });
