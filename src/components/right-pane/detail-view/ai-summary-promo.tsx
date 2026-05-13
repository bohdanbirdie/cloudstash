import { useSettingsDialog } from "@/stores/settings-dialog-store";

import { SectionEyebrow } from "./section-eyebrow";

export function AiSummaryPromo() {
  const openAt = useSettingsDialog((s) => s.openAt);

  return (
    <div className="flex flex-col gap-1.5">
      <SectionEyebrow>AI Summary</SectionEyebrow>
      <button
        type="button"
        onClick={() => openAt("plan")}
        className="w-fit cursor-pointer text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        Available on Plus &rarr;
      </button>
    </div>
  );
}
