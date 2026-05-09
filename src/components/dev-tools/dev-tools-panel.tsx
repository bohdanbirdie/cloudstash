import { FPSMeter } from "@overengineering/fps-meter";
import {
  ActivityIcon,
  ArrowUpRightIcon,
  ChevronLeftIcon,
  CompassIcon,
  DatabaseIcon,
  WrenchIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAppStore } from "@/livestore/store";

const MOTEL_TRACES_URL = "http://127.0.0.1:27686/traces";
const LOCAL_EXPLORER_URL = "/cdn-cgi/explorer";

export function DevToolsPanel() {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => setCollapsed(false)}
        className="bg-card/95 fixed bottom-3 left-3 z-40 shadow-md backdrop-blur"
        aria-label="Open dev tools"
      >
        <WrenchIcon />
      </Button>
    );
  }

  return (
    <div className="bg-card/95 border-border fixed bottom-3 left-3 z-40 flex items-center gap-1 rounded-md border p-1 shadow-md backdrop-blur">
      <DevToolsLink href={MOTEL_TRACES_URL} icon={ActivityIcon}>
        Traces
      </DevToolsLink>
      <DevToolsLink href={LOCAL_EXPLORER_URL} icon={CompassIcon}>
        Explorer
      </DevToolsLink>
      <LivestoreDevtoolsLink />
      <Separator orientation="vertical" className="mx-0.5 h-5" />
      <FPSMeter
        className="border-border rounded-sm border bg-black"
        height={28}
      />
      <Separator orientation="vertical" className="mx-0.5 h-5" />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setCollapsed(true)}
        aria-label="Collapse dev tools"
      >
        <ChevronLeftIcon />
      </Button>
    </div>
  );
}

function LivestoreDevtoolsLink() {
  const store = useAppStore();
  const alias = store.schema.devtools.alias;
  const url = `/_livestore/web/${store.storeId}/${store.clientId}/${store.sessionId}/${alias}`;
  return (
    <DevToolsLink href={url} icon={DatabaseIcon}>
      Livestore
    </DevToolsLink>
  );
}

function DevToolsLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      render={
        <a href={href} target="_blank" rel="noopener noreferrer">
          <Icon />
          {children}
          <ArrowUpRightIcon className="size-3 opacity-60" aria-hidden="true" />
        </a>
      }
    />
  );
}
