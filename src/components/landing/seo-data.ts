export const SITE_URL = "https://cloudstash.dev";

export const SOFTWARE_APPLICATION_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Cloudstash",
  url: `${SITE_URL}/`,
  applicationCategory: "ProductivityApplication",
  operatingSystem: "Web",
  description:
    "Save links from Telegram, Raycast, Chrome, or the web. Cloudstash writes a short AI summary on every save so you can skim before you read.",
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
        "AI summary on every save and integrations with Telegram, Raycast, and Chrome.",
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: "12",
      priceCurrency: "USD",
      description:
        "X bookmark sync with enriched summaries, chat with your archive, and MCP server access.",
    },
  ],
};

export const FAQ_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Where does my data live?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Your archive syncs to every device you sign in on and works offline once it's there. We don't read your links, train on them, or sell them. You can export the whole archive anytime.",
      },
    },
    {
      "@type": "Question",
      name: "Do you train AI on my links?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. When you save a link, we ask an AI to write a summary and that's it. Your archive isn't used to train anything, and nothing reads through your saves in the background.",
      },
    },
    {
      "@type": "Question",
      name: "How do summaries work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "When you save a link, Cloudstash reads the page and writes a short two-paragraph summary. It's stored with the link and searchable. If a summary misses the point, you can re-run it.",
      },
    },
    {
      "@type": "Question",
      name: "How do I connect Raycast or Telegram?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Sign in to the web app and open Integrations — each integration has a guided setup.",
      },
    },
    {
      "@type": "Question",
      name: "Can I export everything?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes — export your whole Vault as Markdown or plain links anytime from the account menu.",
      },
    },
    {
      "@type": "Question",
      name: "How do I delete my account?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "From Settings → Account → Delete. Your archive and summaries are wiped immediately. We don't hold onto anything.",
      },
    },
  ],
};
