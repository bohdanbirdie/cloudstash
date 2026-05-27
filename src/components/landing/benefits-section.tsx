import { BenefitsGrid } from "./benefits";
import { SectionCta, SectionHeader, SHELL } from "./shared";

export function Benefits() {
  return (
    <section
      id="features"
      className="border-y border-border/60 bg-muted/30 py-16 sm:py-20 lg:py-24"
    >
      <div className={SHELL}>
        <SectionHeader
          eyebrow="What changes"
          title={
            <>
              The things you{" "}
              <span
                className="font-italic-accent text-primary"
                style={{ fontSize: "1.17em" }}
              >
                stop
              </span>{" "}
              doing.
            </>
          }
          lead="A summary on every save. An archive you can actually search. The end of “I read that somewhere.”"
        />
        <BenefitsGrid />
        <SectionCta />
      </div>
    </section>
  );
}
