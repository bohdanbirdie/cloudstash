import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import { SectionHeader, SHELL } from "./shared";

const FAQ_ITEMS: readonly { q: string; a: string }[] = [
  {
    q: "Where does my data live?",
    a: "Your archive syncs to every device you sign in on and works offline once it’s there. We don’t read your links, train on them, or sell them. You can export the whole archive anytime.",
  },
  {
    q: "Do you train AI on my links?",
    a: "No. When you save a link, we ask an AI to write a summary and that’s it. Your archive isn’t used to train anything, and nothing reads through your saves in the background.",
  },
  {
    q: "How do summaries work?",
    a: "When you save a link, Cloudstash reads the page and writes a short two-paragraph summary. It’s stored with the link and searchable. If a summary misses the point, you can re-run it.",
  },
  {
    q: "How do I install Raycast, Telegram, or iOS?",
    a: "Sign in to the web app and open Connections — each integration has a one-step setup with the link or shortcut you need.",
  },
  {
    q: "Can I export everything?",
    a: "Yes — links, summaries, and tags, anytime. There’s an Export button right in the app.",
  },
  {
    q: "How do I delete my account?",
    a: "From Settings → Account → Delete. Your archive and summaries are wiped immediately. We don’t hold onto anything.",
  },
];

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
