import { LaunchProps } from "@raycast/api";
import { Effect } from "effect";

import { saveUrl, validateUrl } from "./ingest";
import { provideLive } from "./live";
import { HudService } from "./services";

interface Arguments {
  url: string;
}

const program = (url: string) =>
  Effect.gen(function* () {
    const hud = yield* HudService;
    const validUrl = yield* validateUrl(url);
    const result = yield* saveUrl(validUrl);

    if (result.status === "duplicate") {
      yield* Effect.promise(() =>
        hud.show(`⚠️ Already saved (${result.domain})`)
      );
    } else {
      yield* Effect.promise(() =>
        hud.show(`✅ Saved link from ${result.domain}`)
      );
    }
  });

export default async function SaveLink(
  props: LaunchProps<{ arguments: Arguments }>
) {
  await program(props.arguments.url.trim()).pipe(
    Effect.catchTags({
      InvalidUrlError: () =>
        Effect.gen(function* () {
          const hud = yield* HudService;
          yield* Effect.promise(() => hud.show("❌ Not a valid URL"));
        }),
      AuthError: () =>
        Effect.gen(function* () {
          const hud = yield* HudService;
          yield* Effect.promise(() =>
            hud.show("❌ Failed to connect — try again")
          );
        }),
      ConnectionError: ({ message }) =>
        Effect.gen(function* () {
          const hud = yield* HudService;
          yield* Effect.promise(() => hud.show(`❌ ${message}`));
        }),
      ValidationError: ({ message }) =>
        Effect.gen(function* () {
          const hud = yield* HudService;
          yield* Effect.promise(() => hud.show(`❌ ${message}`));
        }),
    }),
    provideLive,
    Effect.runPromise
  );
}
