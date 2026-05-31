import { Effect } from "effect";
import { ExternalLink } from "lucide-react";

import { CloudstashMark } from "../../components/cloudstash-mark";
import { Button } from "../../components/ui/button";
import { runPopup } from "../../lib/runtime";
import { ConnectClient } from "../../lib/services/connect-client";
import { Header } from "./header";
import { POPUP_MIN_HEIGHT } from "./ui";

export function ConnectScreen() {
  const openConnect = () =>
    runPopup(Effect.flatMap(ConnectClient, (svc) => svc.openConnectPage));

  return (
    <div className={`flex ${POPUP_MIN_HEIGHT} flex-col`}>
      <Header />
      <div className="flex flex-1 flex-col justify-center gap-5 px-6 py-8 text-center">
        <div className="flex flex-col items-center gap-3">
          <CloudstashMark className="size-7 text-foreground" />
          <div className="space-y-1.5">
            <h1 className="text-sm font-semibold tracking-tight">
              Connect to Cloudstash
            </h1>
            <p className="text-xs leading-relaxed text-muted-foreground">
              We’ll open Cloudstash to link your account — no codes to copy.
              Come back here once it says you’re connected.
            </p>
          </div>
        </div>

        <Button onClick={openConnect} className="w-full">
          <ExternalLink className="size-3.5" />
          Connect Cloudstash
        </Button>
      </div>
    </div>
  );
}
