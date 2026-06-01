import { Context, Effect, Layer, Option } from "effect";

import { TabsError } from "../errors";

export type ActiveTab = {
  readonly url: string;
  readonly title: string | null;
  readonly favIconUrl: string | null;
};

export class Tabs extends Context.Tag("@ext/Tabs")<
  Tabs,
  {
    readonly activeTab: Effect.Effect<Option.Option<ActiveTab>, TabsError>;
  }
>() {
  static readonly layer = Layer.sync(Tabs, () => {
    const activeTab = Effect.fn("Tabs.activeTab")(function* () {
      const tabs = yield* Effect.tryPromise({
        try: () => chrome.tabs.query({ active: true, currentWindow: true }),
        catch: (cause) => new TabsError({ cause }),
      });
      const tab = tabs[0];
      if (!tab?.url) return Option.none<ActiveTab>();
      return Option.some<ActiveTab>({
        url: tab.url,
        title: tab.title ?? null,
        favIconUrl: tab.favIconUrl ?? null,
      });
    })();

    return Tabs.of({ activeTab });
  });
}
