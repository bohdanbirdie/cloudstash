import { createFileRoute } from "@tanstack/react-router";

import { LegalShell } from "@/components/landing/legal-shell";
import { SITE_URL } from "@/components/landing/seo-data";

export const Route = createFileRoute("/privacy")({
  ssr: true,
  head: () => ({
    meta: [
      { title: "Privacy Policy — Cloudstash" },
      {
        name: "description",
        content:
          "How Cloudstash handles your data: what we collect, what we don't, and how to delete everything.",
      },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/privacy` }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalShell
      eyebrow="Legal"
      title="Privacy Policy"
      lead="What we collect, what we don't, and how you stay in control of your archive."
    />
  );
}
