import { ArrowUpRight, Globe } from "lucide-react";
import { useState } from "react";

import type { RecentLink } from "./store";

function Favicon({ src }: { src: string | null }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // Site favicons load with no-referrer for the same reason as avatars. A globe
  // sits behind the image so a glyph is always visible; the favicon fades in
  // over it once it loads, and remains the fallback if the tab has none.
  const showImage = src !== null && !failed;
  return (
    <span className="relative flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-[5px] bg-muted text-muted-foreground">
      <Globe className="size-3" aria-hidden="true" />
      {showImage && (
        <img
          src={src}
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

export { Favicon };

export function RecentLinks({ links }: { links: ReadonlyArray<RecentLink> }) {
  if (links.length === 0) {
    return (
      <div className="px-4 py-6">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Nothing saved yet. Links you save appear here.
        </p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border/70">
      {links.map((l) => (
        <li key={l.id}>
          <a
            href={l.url}
            target="_blank"
            rel="noreferrer"
            title={l.title || l.url}
            className="group flex items-start gap-2 px-4 py-2.5 transition-colors duration-150 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="truncate text-xs font-medium text-foreground">
                {l.title || l.url}
              </div>
              <div className="truncate text-[10px] text-muted-foreground">
                {l.domain}
              </div>
            </div>
            <ArrowUpRight
              className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
              aria-hidden="true"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
