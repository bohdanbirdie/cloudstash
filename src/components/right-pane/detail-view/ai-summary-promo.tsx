import { GemIcon } from "lucide-react";

import { usePaywall } from "@/stores/paywall-store";

import { SectionEyebrow } from "./section-eyebrow";

export function AiSummaryPromo() {
  const openPaywall = usePaywall((s) => s.openPaywall);

  return (
    <div className="flex flex-col gap-1.5">
      <SectionEyebrow>AI Summary</SectionEyebrow>
      <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
        Plus adds a short, AI-written recap to every link you save.
      </p>
      <button
        type="button"
        onClick={() =>
          openPaywall({
            highlightTier: "plus",
            reason: "AI summary is a Plus feature.",
          })
        }
        className="mt-0.5 inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-[13px] font-medium text-foreground/80 transition-[color,background-color,scale] duration-150 ease-out hover:bg-muted/70 hover:text-foreground active:scale-[0.96]"
      >
        <GemIcon className="size-3.5 text-primary" aria-hidden />
        Unlock with Plus
      </button>
    </div>
  );
}
