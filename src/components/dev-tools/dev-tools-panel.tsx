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
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { useAppStore } from "@/livestore/store";

const MOTEL_TRACES_URL = "http://127.0.0.1:27686/traces";
const LOCAL_EXPLORER_URL = "/cdn-cgi/explorer";
const COLLAPSED_KEY = "devtools:collapsed";

export function DevToolsPanel() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) === "true"
  );

  const toggle = (next: boolean) => {
    setCollapsed(next);
    localStorage.setItem(COLLAPSED_KEY, String(next));
  };

  // Portaled to `document.body` so its z-index competes at the top level —
  // otherwise the body-portaled mobile sheet renders above it.
  if (collapsed) {
    return createPortal(
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => toggle(false)}
        className="bg-card/95 fixed bottom-3 left-3 z-[9999] shadow-md backdrop-blur"
        aria-label="Open dev tools"
      >
        <WrenchIcon />
      </Button>,
      document.body
    );
  }

  return createPortal(
    <div className="bg-card/95 border-border fixed bottom-3 left-3 z-[9999] flex flex-col gap-1 rounded-md border p-1 shadow-md backdrop-blur">
      <div className="flex items-center justify-between gap-1 pl-1">
        <span className="text-muted-foreground text-xs font-medium">
          Dev tools
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => toggle(true)}
          aria-label="Collapse dev tools"
        >
          <ChevronLeftIcon />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <DevToolsLink href={MOTEL_TRACES_URL} icon={ActivityIcon}>
          Traces
        </DevToolsLink>
        <DevToolsLink href={LOCAL_EXPLORER_URL} icon={CompassIcon}>
          Explorer
        </DevToolsLink>
        <LivestoreDevtoolsLink />
        <FPSMeter
          className="border-border rounded-sm border bg-black"
          height={24}
        />
      </div>
    </div>,
    document.body
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
