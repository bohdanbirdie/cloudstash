import { ArrowUpRight, LogOut } from "lucide-react";
import { useState } from "react";

import { CloudstashMark } from "../../components/cloudstash-mark";
import { Button } from "../../components/ui/button";
import { APP_URL } from "../../lib/config";
import type { ExtAccount } from "../../lib/services/account-client";

function BrandLink() {
  return (
    <a
      href={`${APP_URL}/inbox`}
      target="_blank"
      rel="noreferrer"
      title="Open Cloudstash"
      className="group flex items-center gap-2 rounded-sm text-foreground/90 outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <CloudstashMark className="size-4" />
      <span className="text-xs font-medium tracking-tight">cloudstash</span>
      <ArrowUpRight
        className="size-3 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        aria-hidden="true"
      />
    </a>
  );
}

function AccountAvatar({
  name,
  image,
}: {
  name: string | null;
  image: string | null;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const initial = name?.trim().charAt(0).toUpperCase() || "?";
  // no-referrer is required for Google account avatars (lh3.googleusercontent
  // .com 403s when a referer is sent). The initial sits behind the image so a
  // glyph is always visible; the image fades in over it once it loads.
  const showImage = image !== null && !failed;
  return (
    <span
      aria-hidden="true"
      className="relative flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] font-medium text-muted-foreground"
    >
      {initial}
      {showImage && (
        <img
          src={image}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover transition-opacity duration-150"
          style={{ opacity: loaded ? 1 : 0 }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

function DisconnectButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      onClick={onClick}
      aria-label="Disconnect"
      title="Disconnect"
      className="text-muted-foreground hover:text-foreground"
    >
      <LogOut />
    </Button>
  );
}

export function Header({
  account,
  onDisconnect,
}: {
  account?: ExtAccount | null;
  onDisconnect?: () => void;
}) {
  const firstName = account?.name ? account.name.trim().split(/\s+/)[0] : null;
  const showAccount = firstName !== null;
  return (
    <header className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
      <BrandLink />
      {(showAccount || onDisconnect) && (
        <div className="flex items-center gap-2">
          {showAccount && (
            <span
              className="flex items-center gap-1.5"
              title={account?.name ?? undefined}
            >
              <AccountAvatar
                name={account?.name ?? null}
                image={account?.image ?? null}
              />
              <span className="max-w-[88px] truncate text-xs text-muted-foreground">
                {firstName}
              </span>
            </span>
          )}
          {showAccount && onDisconnect && (
            <span className="h-3.5 w-px bg-border/70" aria-hidden="true" />
          )}
          {onDisconnect && <DisconnectButton onClick={onDisconnect} />}
        </div>
      )}
    </header>
  );
}
