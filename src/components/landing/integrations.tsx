import { cn } from "@/lib/utils";

import { IntegrationsTiles } from "./integrations-tiles";
import { SectionHeader, SHELL } from "./shared";

export function Integrations() {
  return (
    <section
      id="integrations"
      className={cn(SHELL, "pb-16 pt-8 sm:pb-20 sm:pt-10 lg:pb-24 lg:pt-12")}
    >
      <SectionHeader
        eyebrow="Save from anywhere"
        title="From the apps you already use."
      />
      <IntegrationsTiles />
    </section>
  );
}
