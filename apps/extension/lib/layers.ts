import { Layer } from "effect";

import { AccountClient } from "./services/account-client";
import { ConnectClient } from "./services/connect-client";
import { CredsStorage } from "./services/creds-storage";
import { LivestoreHost } from "./services/livestore-host";
import { Messenger } from "./services/messenger";
import { Offscreen } from "./services/offscreen";
import { Tabs } from "./services/tabs";

export const BackgroundLayer = Layer.mergeAll(
  Messenger.layer,
  Offscreen.layer,
  CredsStorage.liveLayer
);

export const OffscreenLayer = LivestoreHost.layer.pipe(
  Layer.provideMerge(CredsStorage.proxyLayer),
  Layer.provideMerge(Messenger.layer)
);

export const PopupLayer = Layer.mergeAll(
  Messenger.layer,
  CredsStorage.liveLayer,
  Tabs.layer,
  ConnectClient.layer,
  AccountClient.layer
);
