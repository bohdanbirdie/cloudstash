import type { Store } from "@livestore/livestore";
import { Option, Schema } from "effect";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Favicon } from "@/components/favicon";
import { track } from "@/lib/analytics";
import { displayTitle } from "@/lib/link-display";
import { formatAgo } from "@/lib/time-ago";
import { linkById$ } from "@/livestore/queries/links";
import { events, schema, tables } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";
import { useRightPaneStore } from "@/stores/right-pane-store";

const UrlSchema = Schema.URL;

interface AddLinkContextValue {
  addLink: (urlInput: string) => void;
}

const AddLinkContext = createContext<AddLinkContextValue | null>(null);

export function useAddLink() {
  const context = useContext(AddLinkContext);
  if (!context) {
    throw new Error("useAddLink must be used within AddLinkProvider");
  }
  return context;
}

interface OgMetadata {
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
}

function normalizeUrl(urlString: string): string {
  try {
    const u = new URL(urlString);
    return (
      u.host.replace(/^www\./, "") +
      u.pathname.replace(/\/$/, "") +
      u.search +
      u.hash
    );
  } catch {
    return urlString.toLowerCase().trim();
  }
}

async function fetchMetadata(targetUrl: string): Promise<OgMetadata | null> {
  try {
    const response = await fetch(
      `/api/metadata?url=${encodeURIComponent(targetUrl)}`
    );
    if (!response.ok) return null;
    return (await response.json()) as OgMetadata;
  } catch {
    return null;
  }
}

async function fetchAndCommitMetadata(
  store: Store<typeof schema>,
  linkId: string,
  url: string
): Promise<void> {
  try {
    const metadata = await fetchMetadata(url);
    if (!metadata) return;
    store.commit(
      events.linkMetadataFetched({
        description: metadata.description ?? null,
        favicon: metadata.favicon ?? null,
        fetchedAt: new Date(),
        id: crypto.randomUUID(),
        image: metadata.image ?? null,
        linkId,
        title: metadata.title ?? null,
      })
    );
  } catch {
    // Background commit — never surface to the caller.
  }
}

export function AddLinkProvider({ children }: { children: ReactNode }) {
  const store = useAppStore();
  const openDetail = useRightPaneStore((s) => s.openDetail);

  const addLink = useCallback(
    (urlInput: string) => {
      const trimmed = urlInput.trim();
      if (!trimmed) return;

      const urlResult = Schema.decodeUnknownOption(UrlSchema)(trimmed);
      if (Option.isNone(urlResult)) {
        toast.error("That doesn't look like a valid URL");
        return;
      }

      const validUrl = urlResult.value.href;
      const normalized = normalizeUrl(validUrl);

      const existingLinks = store.query(
        tables.links.where({ deletedAt: null })
      );
      const existing = existingLinks.find(
        (link) => normalizeUrl(link.url) === normalized
      );
      if (existing) {
        const details = store.query(linkById$(existing.id));
        const linkLike = details ?? { title: null, url: existing.url };
        toast("Already saved", {
          description: (
            <div className="flex min-w-0 items-center gap-2">
              <Favicon
                src={details?.favicon}
                className="size-3.5 shrink-0 rounded-[2px]"
              />
              <span className="truncate">
                {displayTitle(linkLike)} · {formatAgo(existing.createdAt)}
              </span>
            </div>
          ),
          action: {
            label: "View",
            onClick: () => openDetail(existing.id),
          },
        });
        return;
      }

      const domain = new URL(validUrl).hostname;
      const linkId = crypto.randomUUID();
      const now = new Date();

      store.commit(
        events.linkCreatedV2({
          createdAt: now,
          domain,
          id: linkId,
          source: "app",
          sourceMeta: null,
          url: validUrl,
        })
      );

      track("link_added");
      openDetail(linkId);

      // Runs in parallel with LinkProcessorDO — gives a card preview even if
      // the DO is offline. The two metadata commits race; second one wins.
      void fetchAndCommitMetadata(store, linkId, validUrl);
    },
    [store, openDetail]
  );

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const { activeElement } = document;
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement?.getAttribute("contenteditable") === "true"
      ) {
        return;
      }

      const text = e.clipboardData?.getData("text/plain")?.trim();
      if (!text) return;

      const urlResult = Schema.decodeUnknownOption(UrlSchema)(text);
      if (Option.isSome(urlResult)) {
        e.preventDefault();
        addLink(urlResult.value.href);
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [addLink]);

  const value = useMemo(() => ({ addLink }), [addLink]);

  return (
    <AddLinkContext.Provider value={value}>{children}</AddLinkContext.Provider>
  );
}
