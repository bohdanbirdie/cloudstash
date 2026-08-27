import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import { FAQ_ITEMS } from "./faq-data";
import { SectionHeader, SHELL } from "./shared";

export function Faq() {
  return (
    <section id="faq" className={`${SHELL} py-16 sm:py-20 lg:py-24`}>
      <SectionHeader eyebrow="FAQ" title="The short answers." />

      <Accordion className="border-t border-border/60">
        {FAQ_ITEMS.map((item) => (
          <AccordionItem
            key={item.q}
            value={item.q}
            className="border-border/60"
          >
            <AccordionTrigger className="text-[15px] hover:no-underline hover:text-primary data-[panel-open]:text-foreground">
              {item.q}
            </AccordionTrigger>
            <AccordionContent>
              <p className="max-w-[68ch] text-pretty text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
