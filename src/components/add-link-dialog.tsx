import { Option, Schema } from "effect";
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { tables } from "@/livestore/schema";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { HotkeyButton } from "@/components/ui/hotkey-button";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";

const UrlSchema = Schema.URL;

interface AddLinkDialogContextValue {
  open: (initialUrl?: string) => void;
  close: () => void;
}

const AddLinkDialogContext = createContext<AddLinkDialogContextValue | null>(
  null,
);

export function useAddLinkDialog() {
  const context = useContext(AddLinkDialogContext);
  if (!context) {
    throw new Error(
      "useAddLinkDialog must be used within AddLinkDialogProvider",
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
    <Card className={metadata.image ? "mt-4 pt-0" : "mt-4"}>
      {metadata.image && (
        <div className="aspect-video w-full overflow-hidden">
          <img
            src={metadata.image}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      )}
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

// Normalize URL for comparison (strips protocol, www, and trailing slash)
function normalizeUrl(urlString: string): string {
  try {
    const u = new URL(urlString);
    // Remove protocol, www prefix, and trailing slash
    return u.host.replace(/^www\./, "") + u.pathname.replace(/\/$/, "") + u.search + u.hash;
  } catch {
    return urlString.toLowerCase().trim();
  }
}

// Dialog content component - only rendered when dialog is open
function AddLinkDialogContent({
  url,
  setUrl,
  onClose,
}: {
  url: string;
  setUrl: (url: string) => void;
  onClose: () => void;
}) {
  const store = useAppStore();
  const [metadata, setMetadata] = useState<OgMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Query existing links (excluding deleted ones)
  const existingLinks = store.useQuery(tables.links.where({ deletedAt: null }));

  // Check for duplicate URL
  const trimmedUrl = url.trim();
  const urlResult = trimmedUrl ? Schema.decodeUnknownOption(UrlSchema)(trimmedUrl) : Option.none();
  const normalizedInput = Option.isSome(urlResult) ? normalizeUrl(urlResult.value.href) : null;
  const existingLink = normalizedInput
    ? existingLinks.find((link) => normalizeUrl(link.url) === normalizedInput) ?? null
    : null;

  const fetchMetadata = useCallback(async (targetUrl: string) => {
    setIsLoading(true);
    setError(null);
    setMetadata(null);

    try {
      const response = await fetch(
        `/api/metadata?url=${encodeURIComponent(targetUrl)}`,
      );
      const data = (await response.json()) as OgMetadata & { error?: string };

      if (!response.ok) {
        setError(data.error || "Failed to fetch metadata");
        return;
      }

      setMetadata(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch metadata");
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
    if (!trimmedUrl) return;

    let domain = "";
    try {
      const urlObj = new URL(trimmedUrl);
      domain = urlObj.hostname;
    } catch {
      domain = trimmedUrl.split("/")[0];
    }

    const linkId = crypto.randomUUID();
    const now = new Date();

    // Batch both events in a single commit to avoid race condition with LinkProcessorDO
    // If committed separately, the processor might see LinkCreated before LinkMetadataFetched
    // arrives, causing ServerAheadError when it tries to commit its own events
    if (metadata) {
      store.commit(
        events.linkCreated({
          id: linkId,
          url: trimmedUrl,
          domain,
          createdAt: now,
        }),
        events.linkMetadataFetched({
          id: crypto.randomUUID(),
          linkId,
          title: metadata.title ?? null,
          description: metadata.description ?? null,
          image: metadata.image ?? null,
          favicon: metadata.logo ?? null,
          fetchedAt: now,
        }),
      );
    } else {
      store.commit(
        events.linkCreated({
          id: linkId,
          url: trimmedUrl,
          domain,
          createdAt: now,
        }),
      );
    }

    onClose();
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add Link</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit}>
        <Input
          type="url"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoFocus
        />
        {existingLink && (
          <Alert className="mt-2 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200">
            <AlertDescription>
              This link was already added on{" "}
              {existingLink.createdAt.toLocaleDateString()}
            </AlertDescription>
          </Alert>
        )}
        {isLoading && <LinkPreviewSkeleton />}
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        {!isLoading && metadata && <LinkPreviewCard metadata={metadata} url={url} />}
        <DialogFooter className="mt-4">
          <DialogClose render={<HotkeyButton variant="outline" kbdLabel="Esc" />}>
            Cancel
          </DialogClose>
          <HotkeyButton type="submit" disabled={!url.trim()} kbdLabel="↵">
            Add
          </HotkeyButton>
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

  const open = useCallback((urlValue?: string) => {
    setUrl(urlValue ?? "");
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setUrl("");
  }, []);

  // Global paste handler - opens dialog when URL is pasted outside of input fields
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement?.getAttribute("contenteditable") === "true"
      ) {
        return;
      }

      if (isOpen) return;

      const text = e.clipboardData?.getData("text/plain")?.trim();
      if (!text) return;

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
    <AddLinkDialogContext.Provider value={{ open, close }}>
      {children}
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        {isOpen && (
          <AddLinkDialogContent url={url} setUrl={setUrl} onClose={close} />
        )}
      </Dialog>
    </AddLinkDialogContext.Provider>
  );
}
