import { createFileRoute } from "@tanstack/react-router";

import { Benefits } from "@/components/landing/benefits-section";
import { Closer } from "@/components/landing/closer";
import { Faq } from "@/components/landing/faq";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { Integrations } from "@/components/landing/integrations";
import { MobileStickyCta } from "@/components/landing/mobile-sticky-cta";
import { Pitch } from "@/components/landing/pitch";
import { Pricing } from "@/components/landing/pricing";
import {
  FAQ_LD,
  SITE_URL,
  SOFTWARE_APPLICATION_LD,
} from "@/components/landing/seo-data";
import { TopBar } from "@/components/landing/top-bar";
import { META_PIXEL_HEAD_SCRIPTS, MetaPixelNoScript } from "@/lib/meta-pixel";

const TITLE = "Cloudstash — Save links, skim AI summaries";
const DESCRIPTION =
  "Save links from Telegram, Raycast, iOS, Chrome, or the web. Cloudstash writes a two-paragraph AI summary so you can skim before you read.";
const OG_DESCRIPTION =
  "Save links from anywhere. Cloudstash writes a short summary on every save so you can skim before you read.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: OG_DESCRIPTION },
      { property: "og:url", content: `${SITE_URL}/` },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: OG_DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(SOFTWARE_APPLICATION_LD),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(FAQ_LD),
      },
      ...META_PIXEL_HEAD_SCRIPTS,
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-svh scroll-pt-14 bg-background text-foreground">
      <TopBar />
      <main className="pb-20 sm:pb-0">
        <Hero />
        <Pitch />
        <Integrations />
        <Benefits />
        <Pricing />
        <Faq />
        <Closer />
      </main>
      <Footer />
      <MobileStickyCta />
      <MetaPixelNoScript />
    </div>
  );
}
