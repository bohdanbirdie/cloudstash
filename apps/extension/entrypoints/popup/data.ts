import { Effect, Option } from "effect";
import { useEffect, useState } from "react";

import { ApiKey, OrgId } from "../../lib/messages";
import type { Creds } from "../../lib/messages";
import { runPopupState } from "../../lib/runtime";
import type { EffectState } from "../../lib/runtime";
import { AccountClient } from "../../lib/services/account-client";
import type { ExtAccount } from "../../lib/services/account-client";
import { CredsStorage } from "../../lib/services/creds-storage";
import { Tabs as TabsSvc } from "../../lib/services/tabs";
import type { ActiveTab } from "../../lib/services/tabs";

export function useCreds(): EffectState<Creds | null, unknown> {
  const [state, setState] = useState<EffectState<Creds | null, unknown>>({
    status: "loading",
  });
  useEffect(() => {
    let alive = true;
    void runPopupState(Effect.flatMap(CredsStorage, (svc) => svc.get)).then(
      (result) => {
        if (alive) setState(result);
      }
    );
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export function useActiveTab(): EffectState<Option.Option<ActiveTab>, unknown> {
  const [state, setState] = useState<
    EffectState<Option.Option<ActiveTab>, unknown>
  >({ status: "loading" });
  useEffect(() => {
    let alive = true;
    void runPopupState(Effect.flatMap(TabsSvc, (svc) => svc.activeTab)).then(
      (result) => {
        if (alive) setState(result);
      }
    );
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

// Cosmetic only: the header avatar + name. Keyed on the credential primitives
// so it refetches when the connected account changes, not on every render.
export function useAccount(
  apiKey: string | null,
  orgId: string | null
): EffectState<ExtAccount | null, unknown> {
  const [state, setState] = useState<EffectState<ExtAccount | null, unknown>>({
    status: "loading",
  });
  useEffect(() => {
    let alive = true;
    const eff =
      apiKey && orgId
        ? Effect.flatMap(AccountClient, (svc) =>
            svc.get({ apiKey: ApiKey.make(apiKey), orgId: OrgId.make(orgId) })
          )
        : Effect.succeed<ExtAccount | null>(null);
    void runPopupState(eff).then((result) => {
      if (alive) setState(result);
    });
    return () => {
      alive = false;
    };
  }, [apiKey, orgId]);
  return state;
}
