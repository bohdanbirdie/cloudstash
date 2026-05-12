import { IntegrationsTiles } from "./integrations-tiles";
import { SectionHeader, SHELL } from "./shared";

export function Integrations() {
  return (
    <section id="where" className={`${SHELL} py-16 sm:py-20 lg:py-24`}>
      <SectionHeader
        eyebrow="Save from anywhere"
        title="From the apps you already use."
      />
      <IntegrationsTiles />
    </section>
  );
}
