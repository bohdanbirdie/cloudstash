import { Option, Schema } from "effect";
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

    store.commit(
      events.linkCreated({
        id: crypto.randomUUID(),
        url: trimmedUrl,
        domain,
        createdAt: new Date(),
      }),
    );

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
        {isLoading && <p className="mt-2 text-sm text-muted-foreground">Loading metadata...</p>}
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        {metadata && (
          <pre className="mt-2 p-2 text-xs bg-muted rounded overflow-auto max-h-40">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        )}
        <DialogFooter className="mt-4">
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button type="submit" disabled={!url.trim()}>
            Add
          </Button>
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
