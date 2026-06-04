import { StoreRegistryProvider } from "@livestore/react";
import { Effect } from "effect";
import { Suspense, useEffect, useState } from "react";

import type { Creds } from "../../lib/messages";
import { runPopup } from "../../lib/runtime";
import { ConnectClient } from "../../lib/services/connect-client";
import { CredsStorage } from "../../lib/services/creds-storage";
import { ConnectScreen } from "./connect-screen";
import { useAccount, useActiveTab, useCreds } from "./data";
import { SaveAndList } from "./save-and-list";
import { storeRegistry } from "./store";
import { LoadingShell } from "./ui";

export function App() {
  const credsState = useCreds();
  const tabState = useActiveTab();
  const [override, setOverride] = useState<Creds | null | undefined>(undefined);

  const creds: Creds | null =
    override === undefined
      ? credsState.status === "ok"
        ? credsState.value
        : null
      : override;

  const accountState = useAccount(creds?.apiKey ?? null, creds?.orgId ?? null);

  const persist = (next: Creds | null) => {
    runPopup(Effect.flatMap(CredsStorage, (svc) => svc.set(next)));
    setOverride(next);
  };

  const disconnect = () => {
    if (creds) {
      runPopup(Effect.flatMap(ConnectClient, (svc) => svc.disconnect(creds)));
    }
    persist(null);
  };

  const accountResult =
    accountState.status === "ok" ? accountState.value : null;

  const revoked = accountResult?.tag === "unauthorized";
  useEffect(() => {
    if (revoked) persist(null);
  }, [revoked]);

  if (credsState.status === "loading") {
    return <LoadingShell>One moment</LoadingShell>;
  }

  if (!creds) return <ConnectScreen />;

  const tab =
    tabState.status === "ok" && tabState.value._tag === "Some"
      ? tabState.value.value
      : null;

  const account = accountResult?.tag === "ok" ? accountResult.account : null;

  return (
    <StoreRegistryProvider storeRegistry={storeRegistry}>
      <Suspense fallback={<LoadingShell>Syncing</LoadingShell>}>
        <SaveAndList
          creds={creds}
          tab={tab}
          account={account}
          onDisconnect={disconnect}
        />
      </Suspense>
    </StoreRegistryProvider>
  );
}
