import {
  CheckIcon,
  CodeIcon,
  ExternalLinkIcon,
  MessageSquareIcon,
  SendIcon,
} from "lucide-react";

import { Favicon } from "@/components/favicon";
import { formatAgo } from "@/lib/time-ago";
import type { LinkWithDetails } from "@/livestore/queries/links";

const SOURCE_CONFIG: Record<string, { icon: typeof SendIcon; label: string }> =
  {
    telegram: { icon: SendIcon, label: "Telegram" },
    api: { icon: CodeIcon, label: "API" },
    chat: { icon: MessageSquareIcon, label: "Chat" },
  };

export function MetaRow({ link }: { link: LinkWithDetails }) {
  const isCompleted = link.status === "completed";
  const isDeleted = link.deletedAt !== null;
  const source = link.source && link.source !== "app" ? link.source : null;
  const sourceConfig = source ? SOURCE_CONFIG[source] : null;
  const SourceIcon = sourceConfig?.icon;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group/domain inline-flex items-center gap-1 transition-colors duration-150 hover:text-foreground"
      >
        <Favicon src={link.favicon} className="size-3.5" />
        <span className="group-hover/domain:underline group-hover/domain:decoration-1 group-hover/domain:underline-offset-2">
          {link.domain}
        </span>
        <ExternalLinkIcon
          aria-hidden="true"
          className="hidden size-3 group-hover/domain:inline-flex"
        />
      </a>
      <span aria-hidden="true">·</span>
      <span className="tabular-nums">{formatAgo(link.createdAt)}</span>
      {sourceConfig && SourceIcon && (
        <>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <SourceIcon className="size-3" />
            {sourceConfig.label}
          </span>
        </>
      )}
      {isDeleted && (
        <>
          <span aria-hidden="true">·</span>
          <span>Archived</span>
        </>
      )}
      {isCompleted && !isDeleted && (
        <>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <CheckIcon aria-hidden="true" className="size-3" />
            Completed
          </span>
        </>
      )}
    </div>
  );
}
