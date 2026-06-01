import { useStore } from "@livestore/react";
import { events, schema } from "@web/livestore/schema";
import { Match } from "effect";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
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

function SavedLabel() {
  return (
    <>
      <CheckCircle2 className="size-3.5" />
      Saved
    </>
  );
}

function useSaveLink(
  commit: (event: ReturnType<typeof events.linkCreatedV2>) => void,
  recent: readonly { id: string }[]
) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saved = pendingId !== null;
  const materialized = saved && recent.some((l) => l.id === pendingId);

  useEffect(() => {
    if (materialized) window.close();
  }, [materialized]);

  const save = (parsed: URL) => {
    const id = crypto.randomUUID();
    commit(
      events.linkCreatedV2({
        createdAt: new Date(),
        domain: parsed.hostname,
        id,
        source: "extension",
        sourceMeta: null,
        url: parsed.href,
      })
    );
    setError(null);
    setPendingId(id);
  };

  const reset = () => {
    setPendingId(null);
    setError(null);
  };

  return { save, reset, saved, materialized, error, setError };
}

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
  const { save, reset, saved, materialized, error, setError } = useSaveLink(
    store.commit,
    recent
  );

  const parsedTab = tab ? parseHttpUrl(tab.url) : null;
  const tabSavable = parsedTab !== null;

  const [pasteMode, setPasteMode] = useState(false);
  const mode: "card" | "input" = tabSavable && !pasteMode ? "card" : "input";

  const [url, setUrl] = useState("");
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  const parsedInput = parseHttpUrl(url);
  const tabAlreadySaved = parsedTab
    ? recent.some((l) => l.url === parsedTab.href)
    : false;
  const inputAlreadySaved = parsedInput
    ? recent.some((l) => l.url === parsedInput.href)
    : false;
  const tabDomain = parsedTab?.hostname ?? null;

  const saveTab = () => {
    if (parsedTab && !tabAlreadySaved) save(parsedTab);
  };

  const onUrlChange = (next: string) => {
    setUrl(next);
    if (saved) reset();
  };

  const onInputSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (inputAlreadySaved) return;
    if (!parsedInput) {
      setError("Enter a valid link");
      return;
    }
    save(parsedInput);
  };

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

        {Match.value(mode).pipe(
          Match.when("card", () => (
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

              {Match.value({ saved, tabAlreadySaved }).pipe(
                Match.when({ saved: true }, () => (
                  <Button autoFocus disabled className="w-full">
                    <SavedLabel />
                  </Button>
                )),
                Match.when({ tabAlreadySaved: true }, () => (
                  <Button variant="outline" disabled className="w-full">
                    <CheckCircle2 className="size-3.5" />
                    Already saved
                  </Button>
                )),
                Match.orElse(() => (
                  <Button autoFocus onClick={saveTab} className="w-full">
                    Save this page
                  </Button>
                ))
              )}

              <TextToggle onClick={() => setPasteMode(true)}>
                Paste a link instead
              </TextToggle>
            </div>
          )),
          Match.when("input", () => (
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
                {Match.value({ saved, inputAlreadySaved }).pipe(
                  Match.when({ saved: true }, () => <SavedLabel />),
                  Match.when(
                    { inputAlreadySaved: true },
                    () => "Already saved"
                  ),
                  Match.orElse(() => "Save")
                )}
              </Button>

              {Match.value(tabSavable).pipe(
                Match.when(true, () => (
                  <TextToggle
                    onClick={() => {
                      setPasteMode(false);
                      setError(null);
                    }}
                  >
                    ← Save this page instead
                  </TextToggle>
                )),
                Match.orElse(() => (
                  <p className="text-[11px] leading-4 text-muted-foreground">
                    This page isn’t a link you can save — paste one above.
                  </p>
                ))
              )}
            </form>
          )),
          Match.exhaustive
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
