import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
} from "@tanstack/react-router";

import { SITE_URL } from "@/components/landing/seo-data";
import type { RouterContext } from "@/router";

// `stonks.js` is a tracking pixel — only ship to prod. Local dev should
// not be polluting analytics.
const ANALYTICS_SCRIPTS = import.meta.env.PROD
  ? [
      {
        src: "https://assets.onedollarstats.com/stonks.js" as const,
        defer: true as const,
      },
    ]
  : [];

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { property: "og:site_name", content: "Cloudstash" },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "en_US" },
      { property: "og:image", content: `${SITE_URL}/cloudstash-og.png` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content:
          "Cloudstash inbox showing saved links with AI-generated summaries",
      },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:image",
        content: `${SITE_URL}/cloudstash-og.png`,
      },
      {
        name: "twitter:image:alt",
        content:
          "Cloudstash inbox showing saved links with AI-generated summaries",
      },
    ],
    scripts: ANALYTICS_SCRIPTS,
  }),
  component: () => (
    <>
      <HeadContent />
      <Outlet />
    </>
  ),
});
