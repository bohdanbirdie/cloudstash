import { createFileRoute } from "@tanstack/react-router";

import { LegalShell } from "@/components/landing/legal-shell";
import { SITE_URL } from "@/components/landing/seo-data";
import { META_PIXEL_HEAD_SCRIPTS, MetaPixelNoScript } from "@/lib/meta-pixel";

export const Route = createFileRoute("/contact")({
  ssr: true,
  head: () => ({
    meta: [
      { title: "Contact — Cloudstash" },
      {
        name: "description",
        content:
          "Get in touch with the Cloudstash team — feedback, bugs, partnerships.",
      },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/contact` }],
    scripts: [...META_PIXEL_HEAD_SCRIPTS],
  }),
  component: ContactPage,
});

function ContactPage() {
  return (
    <LegalShell
      eyebrow="Get in touch"
      title="Contact"
      lead="Feedback, bug reports, partnerships — we read every message."
    >
      <p>
        Email us at{" "}
        <a
          href="mailto:support@cloudstash.dev"
          className="text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
        >
          support@cloudstash.dev
        </a>
        . A proper contact form is on the way.
      </p>
      <MetaPixelNoScript />
    </LegalShell>
  );
}
