import { useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";
import { useEffect, useMemo, useState, useDeferredValue } from "react";

import { useLinkDetailDialog } from "@/components/link-detail-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { HighlightedText } from "@/components/ui/highlighted-text";
import { buildPages } from "@/config/pages";
import { useTrackLinkOpen } from "@/hooks/use-track-link-open";
import {
  recentlyOpenedLinks$,
  searchLinks$,
  type LinkWithDetails,
  type SearchResult,
} from "@/livestore/queries";
import { useAppStore } from "@/livestore/store";
import { useSearchStore } from "@/stores/search-store";

function getStatusBadge(link: LinkWithDetails | SearchResult) {
  if (link.deletedAt) {
    return { className: "bg-muted text-muted-foreground", label: "Trash" };
  }
  if (link.status === "completed") {
    return { className: "bg-green-500/15 text-green-600", label: "Completed" };
  }
  return null;
}

function LinkItem({
  link,
  onSelect,
}: {
  link: LinkWithDetails;
  onSelect: () => void;
}) {
  const status = getStatusBadge(link);
  return (
    <CommandItem
      value={link.id}
      onSelect={onSelect}
      className="flex items-center gap-3 p-3 rounded-md border border-transparent data-[selected=true]:border-border"
    >
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          {link.favicon && (
            <img src={link.favicon} alt="" className="h-4 w-4 shrink-0" />
          )}
          <span className="text-muted-foreground text-xs">{link.domain}</span>
          {status && (
            <Badge
              variant="secondary"
              className={`text-[10px] px-1.5 py-0 ${status.className}`}
            >
              {status.label}
            </Badge>
          )}
        </div>
        <div className="font-medium truncate">{link.title || link.url}</div>
        {link.description && (
          <p className="text-muted-foreground text-xs line-clamp-1">
            {link.description}
          </p>
        )}
      </div>
      <ArrowRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
    </CommandItem>
  );
}

function SearchResultItem({
  link,
  query,
  onSelect,
}: {
  link: SearchResult;
  query: string;
  onSelect: () => void;
}) {
  const status = getStatusBadge(link);
  return (
    <CommandItem
      value={link.id}
      onSelect={onSelect}
      className="flex items-center gap-3 p-3 rounded-md border border-transparent data-[selected=true]:border-border"
    >
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          {link.favicon && (
            <img src={link.favicon} alt="" className="h-4 w-4 shrink-0" />
          )}
          <HighlightedText
            text={link.domain}
            query={query}
            className="text-muted-foreground text-xs"
          />
          {status && (
            <Badge
              variant="secondary"
              className={`text-[10px] px-1.5 py-0 ${status.className}`}
            >
              {status.label}
            </Badge>
          )}
        </div>
        <div className="font-medium truncate">
          <HighlightedText text={link.title || link.url} query={query} />
        </div>
        {link.description && (
          <p className="text-muted-foreground text-xs line-clamp-4">
            <HighlightedText text={link.description} query={query} />
          </p>
        )}
      </div>
      <ArrowRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
    </CommandItem>
  );
}

export function SearchCommand() {
  const { open, setOpen } = useSearchStore();
  const trackLinkOpen = useTrackLinkOpen();
  const { open: openLinkDialog } = useLinkDetailDialog();
  const store = useAppStore();
  const router = useRouter();
  const navigate = useNavigate();

  const [inputValue, setInputValue] = useState("");
  const deferredQuery = useDeferredValue(inputValue.trim());

  const pages = useMemo(
    () => buildPages(router.routeTree.children),
    [router.routeTree]
  );

  const recentLinks = store.useQuery(recentlyOpenedLinks$);
  const searchResults = store.useQuery(searchLinks$(deferredQuery));
  const showSearchResults = deferredQuery.length > 0;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        useSearchStore.getState().toggle();
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (!open) {
      setInputValue("");
    }
  }, [open]);

  const handleSelectLink = (link: LinkWithDetails | SearchResult) => {
    setOpen(false);
    trackLinkOpen(link.id);
    openLinkDialog({ linkId: link.id });
  };

  const handleSelectPage = (path: string) => {
    setOpen(false);
    navigate({ to: path });
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search"
      description="Search pages and links"
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search links..."
          value={inputValue}
          onValueChange={setInputValue}
        />
        <CommandList>
          {showSearchResults ? (
            <>
              {searchResults.length === 0 ? (
                <CommandEmpty>
                  No links found for "{deferredQuery}"
                </CommandEmpty>
              ) : (
                <CommandGroup heading={`Results (${searchResults.length})`}>
                  {searchResults.map((link) => (
                    <SearchResultItem
                      key={link.id}
                      link={link}
                      query={deferredQuery}
                      onSelect={() => handleSelectLink(link)}
                    />
                  ))}
                </CommandGroup>
              )}
            </>
          ) : (
            <>
              <CommandGroup heading="Pages">
                {pages.map((page) => (
                  <CommandItem
                    key={page.path}
                    value={page.path}
                    onSelect={() => handleSelectPage(page.path)}
                    className="flex items-center gap-3 p-2"
                  >
                    {page.Icon && (
                      <page.Icon className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{page.title}</span>
                    <ArrowRightIcon className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                  </CommandItem>
                ))}
              </CommandGroup>

              {recentLinks.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Recently Opened">
                    {recentLinks.map((link) => (
                      <LinkItem
                        key={link.id}
                        link={link}
                        onSelect={() => handleSelectLink(link)}
                      />
                    ))}
                  </CommandGroup>
                </>
              )}
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
