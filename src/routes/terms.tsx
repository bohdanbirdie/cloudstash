import { createFileRoute } from "@tanstack/react-router";

import { LegalShell } from "@/components/landing/legal-shell";
import { SITE_URL } from "@/components/landing/seo-data";

export const Route = createFileRoute("/terms")({
  ssr: true,
  head: () => ({
    meta: [
      { title: "Terms of Service — Cloudstash" },
      {
        name: "description",
        content:
          "The terms that apply when you use Cloudstash to save and summarize links.",
      },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/terms` }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalShell
      eyebrow="Legal"
      title="Terms of Service"
      lead="The agreement between you and Cloudstash when you save links with us."
    />
  );
}
