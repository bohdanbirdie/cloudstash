import { Clipboard, getPreferenceValues, showHUD } from "@raycast/api";
import { Effect } from "effect";

import { getApiKey, clearApiKey } from "./oauth";
import {
  AuthService,
  ClipboardService,
  HttpService,
  HudService,
  PreferencesService,
} from "./services";

interface Preferences {
  serverUrl: string;
}

export const provideLive = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    | AuthService
    | ClipboardService
    | HttpService
    | HudService
    | PreferencesService
  >
): Effect.Effect<A, E> =>
  effect.pipe(
    Effect.provideService(AuthService, { getApiKey, clearApiKey }),
    Effect.provideService(ClipboardService, {
      readText: () => Clipboard.readText(),
    }),
    Effect.provideService(HttpService, { fetch: globalThis.fetch }),
    Effect.provideService(HudService, { show: showHUD }),
    Effect.provideService(
      PreferencesService,
      getPreferenceValues<Preferences>()
    )
  );
