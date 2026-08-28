import { BenefitsGrid } from "./benefits";
import { SectionCta, SectionHeader, SHELL } from "./shared";

export function Benefits() {
  return (
    <section id="features" className="bg-muted/30 py-16 sm:py-20 lg:py-24">
      <div className={SHELL}>
        <SectionHeader
          eyebrow="What changes"
          title="Your saved links stay useful."
          lead="Find what you need, understand it quickly, and use it without reopening every page."
        />
        <BenefitsGrid />
        <SectionCta lead="Start a library you’ll actually use." />
      </div>
    </section>
  );
}
