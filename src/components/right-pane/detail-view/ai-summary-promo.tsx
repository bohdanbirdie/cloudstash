import { SectionEyebrow } from "./section-eyebrow";

export function AiSummaryPromo() {
  return (
    <div className="flex flex-col gap-1.5">
      <SectionEyebrow>AI Summary</SectionEyebrow>
      <button
        type="button"
        className="w-fit cursor-pointer text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        Available on Pro &rarr;
      </button>
    </div>
  );
}
