import { useStore } from "@livestore/react";
import { events, schema } from "@web/livestore/schema";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import type { Creds } from "../../lib/messages";
import type { ExtAccount } from "../../lib/services/account-client";
import type { ActiveTab } from "../../lib/services/tabs";
import { DisconnectOverlay } from "./disconnect-overlay";
import { Header } from "./header";
import { Favicon, RecentLinks } from "./recent-links";
import { adapter, recentLinks$ } from "./store";
import { ErrorLine, KeyboardHint, SectionLabel, TextToggle } from "./ui";

function parseHttpUrl(input: string): URL | null {
  try {
    const u = new URL(input.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

// Hold the confirmation briefly so the user sees it, then close. If sync never
// materializes within the timeout, surface an error instead of a dead popup.
const COMMIT_HOLD_MS = 700;
const COMMIT_TIMEOUT_MS = 5000;

export function SaveAndList({
  creds,
  tab,
  account,
  onDisconnect,
}: {
  creds: Creds;
  tab: ActiveTab | null;
  account: ExtAccount | null;
  onDisconnect: () => void;
}) {
  const store = useStore({
    adapter,
    schema,
    storeId: creds.orgId,
    syncPayload: { apiKey: creds.apiKey },
  });
  const recent = store.useQuery(recentLinks$);

  // The active tab is the primary thing to save; arbitrary-URL paste is the
  // secondary path. A non-http tab (chrome://, new tab) has nothing to save, so
  // there's no card and paste becomes the only path.
  const parsedTab = useMemo(() => (tab ? parseHttpUrl(tab.url) : null), [tab]);
  const tabSavable = parsedTab !== null;

  const [pasteMode, setPasteMode] = useState(false);
  const mode: "card" | "input" = tabSavable && !pasteMode ? "card" : "input";

  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  const parsedInput = useMemo(() => parseHttpUrl(url), [url]);
  const tabAlreadySaved = parsedTab
    ? recent.some((l) => l.url === parsedTab.href)
    : false;
  const inputAlreadySaved = parsedInput
    ? recent.some((l) => l.url === parsedInput.href)
    : false;

  // When the just-committed link appears in the recent list, the save reached
  // the local store + materializer. Hold briefly so the confirmation is seen,
  // then close; if it never materializes, surface an error.
  const closeScheduledRef = useRef(false);
  const lastSubmittedUrlRef = useRef<string | null>(null);
  const materialized = pendingId
    ? recent.some((l) => l.id === pendingId)
    : false;

  useEffect(() => {
    if (!pendingId || closeScheduledRef.current) return;
    if (materialized) {
      closeScheduledRef.current = true;
      const t = setTimeout(() => window.close(), COMMIT_HOLD_MS);
      return () => clearTimeout(t);
    }
    const timeoutId = setTimeout(() => {
      setError("Save did not sync — try again");
      setPendingId(null);
    }, COMMIT_TIMEOUT_MS);
    return () => clearTimeout(timeoutId);
  }, [pendingId, materialized]);

  const commitSave = (parsed: URL) => {
    const id = crypto.randomUUID();
    closeScheduledRef.current = false;
    store.commit(
      events.linkCreatedV2({
        createdAt: new Date(),
        domain: parsed.hostname,
        id,
        source: "extension",
        sourceMeta: null,
        url: parsed.href,
      })
    );
    setPendingId(id);
  };

  const saveTab = () => {
    if (!parsedTab || tabAlreadySaved) return;
    setError(null);
    commitSave(parsedTab);
  };

  const onUrlChange = (next: string) => {
    setUrl(next);
    // Once a paste-mode save commits, editing the field clears the pending
    // state so a second link can be saved.
    if (lastSubmittedUrlRef.current && next !== lastSubmittedUrlRef.current) {
      setPendingId(null);
      setError(null);
    }
  };

  const onInputSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    // Already-saved is a benign state, not an error — the disabled button
    // already says so, so an Enter press is just a no-op (no red alert).
    if (inputAlreadySaved) return;
    if (!parsedInput) {
      setError("Enter a valid link");
      return;
    }
    lastSubmittedUrlRef.current = url;
    commitSave(parsedInput);
  };

  const saved = pendingId !== null;
  const tabDomain = parsedTab?.hostname ?? null;

  return (
    <div className="relative flex flex-col">
      <div className="flex flex-col" inert={confirmingDisconnect || undefined}>
        <Header
          account={account}
          onDisconnect={() => setConfirmingDisconnect(true)}
        />

        <div aria-live="polite" className="sr-only">
          {materialized ? "Link saved" : ""}
        </div>

        {mode === "card" ? (
          <div className="flex flex-col gap-2.5 px-4 pt-4 pb-3">
            <div className="flex items-baseline justify-between">
              <SectionLabel as="h1">This page</SectionLabel>
              {!tabAlreadySaved && <KeyboardHint keys={["↵"]} label="save" />}
            </div>

            <div className="flex items-center gap-2.5">
              <Favicon src={tab?.favIconUrl ?? null} />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="truncate text-xs font-medium text-foreground">
                  {tab?.title || tabDomain}
                </div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {tabDomain}
                  {tabAlreadySaved ? " · already saved" : ""}
                </div>
              </div>
            </div>

            <ErrorLine message={error} />

            {tabAlreadySaved && !saved ? (
              <Button variant="outline" disabled className="w-full">
                <CheckCircle2 className="size-3.5" />
                Already saved
              </Button>
            ) : (
              <Button
                autoFocus
                onClick={saveTab}
                disabled={saved}
                className="w-full"
              >
                {saved ? (
                  <>
                    <CheckCircle2 className="size-3.5" />
                    Saved
                  </>
                ) : (
                  "Save this page"
                )}
              </Button>
            )}

            <TextToggle onClick={() => setPasteMode(true)}>
              Paste a link instead
            </TextToggle>
          </div>
        ) : (
          <form
            onSubmit={onInputSubmit}
            className="flex flex-col gap-2 px-4 pt-4 pb-3"
          >
            <div className="flex items-baseline justify-between">
              <h1>
                <Label
                  htmlFor="cs-url"
                  className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase"
                >
                  URL
                </Label>
              </h1>
              <KeyboardHint keys={["↵"]} label="save" />
            </div>
            <Input
              autoFocus
              id="cs-url"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              placeholder="Paste a link to save"
              className="font-strict-mono text-xs/relaxed"
            />
            <ErrorLine message={error} />
            <Button
              type="submit"
              size="default"
              disabled={saved || !url.trim() || inputAlreadySaved}
              className="w-full"
            >
              {saved ? (
                <>
                  <CheckCircle2 className="size-3.5" />
                  Saved
                </>
              ) : inputAlreadySaved ? (
                "Already saved"
              ) : (
                "Save"
              )}
            </Button>

            {tabSavable ? (
              <TextToggle
                onClick={() => {
                  setPasteMode(false);
                  setError(null);
                }}
              >
                ← Save this page instead
              </TextToggle>
            ) : (
              <p className="text-[11px] leading-4 text-muted-foreground">
                This page isn’t a link you can save — paste one above.
              </p>
            )}
          </form>
        )}

        <div className="border-t border-border/70 px-4 pt-3 pb-2">
          <SectionLabel as="h2">Recently saved</SectionLabel>
        </div>
        <RecentLinks links={recent} />
      </div>

      {confirmingDisconnect && (
        <DisconnectOverlay
          onConfirm={onDisconnect}
          onCancel={() => setConfirmingDisconnect(false)}
        />
      )}
    </div>
  );
}
