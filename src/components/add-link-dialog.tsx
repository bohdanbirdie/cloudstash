import { Option, Schema } from "effect";
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

import { LinkImage } from "@/components/link-card";
import { useLinkDetailDialog } from "@/components/link-detail-dialog";
import { TagCombobox } from "@/components/tags/tag-combobox";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { HotkeyButton } from "@/components/ui/hotkey-button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useHotkeyScope } from "@/hooks/use-hotkey-scope";
import { track } from "@/lib/analytics";
import { linkById$ } from "@/livestore/queries/links";
import { tables, events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";

const UrlSchema = Schema.URL;

interface AddLinkDialogContextValue {
  open: (initialUrl?: string) => void;
  close: () => void;
}

const AddLinkDialogContext = createContext<AddLinkDialogContextValue | null>(
  null
);

export function useAddLinkDialog() {
  const context = useContext(AddLinkDialogContext);
  if (!context) {
    throw new Error(
      "useAddLinkDialog must be used within AddLinkDialogProvider"
    );
  }
  return context;
}

interface AddLinkDialogProviderProps {
  children: ReactNode;
}

interface OgMetadata {
  title?: string;
  description?: string;
  image?: string;
  logo?: string;
  url?: string;
}

function LinkPreviewSkeleton() {
  return (
    <Card className="mt-4">
      <Skeleton className="aspect-video w-full" />
      <CardHeader>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </CardHeader>
    </Card>
  );
}

function LinkPreviewCard({
  metadata,
  url,
}: {
  metadata: OgMetadata;
  url: string;
}) {
  const displayTitle = metadata.title || url;
  let domain = "";
  try {
    domain = new URL(url).hostname;
  } catch {
    domain = url.split("/")[0];
  }

  return (
    <Card className="mt-4 pt-0">
      <LinkImage src={metadata.image} />
      <CardHeader>
        <div className="flex items-center gap-2">
          {metadata.logo && (
            <img src={metadata.logo} alt="" className="h-4 w-4 shrink-0" />
          )}
          <span className="text-muted-foreground text-xs truncate">
            {domain}
          </span>
        </div>
        <CardTitle className="line-clamp-2 text-base">{displayTitle}</CardTitle>
        {metadata.description && (
          <CardDescription className="line-clamp-3">
            {metadata.description}
          </CardDescription>
        )}
      </CardHeader>
    </Card>
  );
}

function ExistingLinkCard({ linkId }: { linkId: string }) {
  const store = useAppStore();
  const link = store.useQuery(linkById$(linkId));

  if (!link) {
    return null;
  }

  const displayTitle = link.title || link.url;
  const formattedDate = new Date(link.createdAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <Card className="mt-4 pt-0 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/50">
      <LinkImage src={link.image} />
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          {link.favicon && (
            <img src={link.favicon} alt="" className="h-4 w-4 shrink-0" />
          )}
          <span className="text-muted-foreground text-xs truncate">
            {link.domain}
          </span>
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300"
          >
            Already saved
          </Badge>
        </div>
        <CardTitle className="line-clamp-2 text-base">{displayTitle}</CardTitle>
        {link.description && (
          <CardDescription className="line-clamp-2">
            {link.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <span className="text-muted-foreground text-xs">
          Saved on {formattedDate}
        </span>
        {link.status === "completed" && (
          <span className="text-green-600 dark:text-green-400 text-xs ml-2">
            • Completed
          </span>
        )}
      </CardContent>
    </Card>
  );
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

function AddLinkDialogContent({
  url,
  setUrl,
  selectedTagIds,
  setSelectedTagIds,
  onClose,
  onViewExisting,
}: {
  url: string;
  setUrl: (url: string) => void;
  selectedTagIds: string[];
  setSelectedTagIds: (tagIds: string[]) => void;
  onClose: () => void;
  onViewExisting: (linkId: string) => void;
}) {
  useHotkeyScope("dialog");

  const store = useAppStore();
  const [metadata, setMetadata] = useState<OgMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingLinks = store.useQuery(tables.links.where({ deletedAt: null }));

  const trimmedUrl = url.trim();
  const urlResult = trimmedUrl
    ? Schema.decodeUnknownOption(UrlSchema)(trimmedUrl)
    : Option.none();
  const normalizedInput = Option.isSome(urlResult)
    ? normalizeUrl(urlResult.value.href)
    : null;
  const existingLink = normalizedInput
    ? (existingLinks.find(
        (link) => normalizeUrl(link.url) === normalizedInput
      ) ?? null)
    : null;

  const fetchMetadata = useCallback(async (targetUrl: string) => {
    setIsLoading(true);
    setError(null);
    setMetadata(null);

    try {
      const response = await fetch(
        `/api/metadata?url=${encodeURIComponent(targetUrl)}`
      );
      const data = (await response.json()) as OgMetadata & { error?: string };

      if (!response.ok) {
        setError(data.error || "Failed to fetch metadata");
        return;
      }

      setMetadata(data);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to fetch metadata"
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setMetadata(null);
      setError(null);
      return;
    }

    const urlResult = Schema.decodeUnknownOption(UrlSchema)(trimmedUrl);
    if (Option.isSome(urlResult)) {
      fetchMetadata(urlResult.value.href);
    }
  }, [url, fetchMetadata]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      return;
    }

    let domain = "";
    try {
      const urlObj = new URL(trimmedUrl);
      domain = urlObj.hostname;
    } catch {
      domain = trimmedUrl.split("/")[0];
    }

    const linkId = crypto.randomUUID();
    const now = new Date();

    const eventsToCommit = [];

    eventsToCommit.push(
      events.linkCreated({
        createdAt: now,
        domain,
        id: linkId,
        url: trimmedUrl,
      })
    );

    if (metadata) {
      eventsToCommit.push(
        events.linkMetadataFetched({
          description: metadata.description ?? null,
          favicon: metadata.logo ?? null,
          fetchedAt: now,
          id: crypto.randomUUID(),
          image: metadata.image ?? null,
          linkId,
          title: metadata.title ?? null,
        })
      );
    }

    for (const tagId of selectedTagIds) {
      eventsToCommit.push(
        events.linkTagged({
          createdAt: now,
          id: `${linkId}-${tagId}`,
          linkId,
          tagId,
        })
      );
    }

    store.commit(...eventsToCommit);

    track("link_added");
    onClose();
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add Link</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          type="url"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoFocus
        />
        <TagCombobox
          selectedTagIds={selectedTagIds}
          onChange={setSelectedTagIds}
          placeholder="Add tags..."
        />
        {existingLink ? (
          <ExistingLinkCard linkId={existingLink.id} />
        ) : (
          <>
            {isLoading && <LinkPreviewSkeleton />}
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            {!isLoading && metadata && (
              <LinkPreviewCard metadata={metadata} url={url} />
            )}
          </>
        )}
        <DialogFooter className="mt-4">
          <DialogClose
            render={
              <HotkeyButton variant="outline" hotkey="escape" scope="dialog" />
            }
          >
            Cancel
          </DialogClose>
          {existingLink ? (
            <HotkeyButton
              type="button"
              hotkey="enter"
              scope="dialog"
              onClick={() => {
                onClose();
                onViewExisting(existingLink.id);
              }}
            >
              View Saved Link
            </HotkeyButton>
          ) : (
            <HotkeyButton
              type="submit"
              disabled={!url.trim()}
              hotkey="enter"
              scope="dialog"
            >
              Add
            </HotkeyButton>
          )}
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export function AddLinkDialogProvider({
  children,
}: AddLinkDialogProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const { open: openLinkDialog } = useLinkDetailDialog();

  const open = useCallback((urlValue?: string) => {
    setUrl(urlValue ?? "");
    setSelectedTagIds([]);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setUrl("");
    setSelectedTagIds([]);
  }, []);

  const handleViewExisting = useCallback(
    (linkId: string) => {
      openLinkDialog({ linkId });
    },
    [openLinkDialog]
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

      if (isOpen) {
        return;
      }

      const text = e.clipboardData?.getData("text/plain")?.trim();
      if (!text) {
        return;
      }

      const urlResult = Schema.decodeUnknownOption(UrlSchema)(text);
      if (Option.isSome(urlResult)) {
        e.preventDefault();
        open(urlResult.value.href);
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [isOpen, open]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      close();
    }
  };

  return (
    <AddLinkDialogContext.Provider value={{ close, open }}>
      {children}
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        {isOpen && (
          <AddLinkDialogContent
            url={url}
            setUrl={setUrl}
            selectedTagIds={selectedTagIds}
            setSelectedTagIds={setSelectedTagIds}
            onClose={close}
            onViewExisting={handleViewExisting}
          />
        )}
      </Dialog>
    </AddLinkDialogContext.Provider>
  );
}
