import { FAQ_ITEMS } from "./faq-data";

export const SITE_URL = "https://cloudstash.dev";

export const SOFTWARE_APPLICATION_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Cloudstash",
  url: `${SITE_URL}/`,
  applicationCategory: "ProductivityApplication",
  operatingSystem: "Web",
  description:
    "Save links from Telegram, Raycast, Chrome, or the web. Cloudstash adds clear AI summaries so you can skim before you read.",
  image: `${SITE_URL}/cloudstash-og.png`,
  offers: [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "USD",
      description: "Save links, tag, archive, search, sync, export.",
    },
    {
      "@type": "Offer",
      name: "Plus",
      price: "5",
      priceCurrency: "USD",
      description:
        "AI summaries, weekly digests, API access, and integrations with Telegram, Raycast, and Chrome.",
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: "12",
      priceCurrency: "USD",
      description:
        "X bookmark sync with enriched summaries, chat with your Vault, and MCP server access.",
    },
  ],
};

export const FAQ_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};
