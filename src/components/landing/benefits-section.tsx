import { BenefitsGrid } from "./benefits";
import { SectionCta, SectionHeader, SHELL } from "./shared";

export function Benefits() {
  return (
    <section
      id="benefits"
      className="border-y border-border/60 bg-muted/30 py-16 sm:py-20 lg:py-24"
    >
      <div className={SHELL}>
        <SectionHeader
          eyebrow="What you get"
          title="What you get with every save."
        />
        <BenefitsGrid />
        <SectionCta />
      </div>
    </section>
  );
}
