import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { SWRConfig } from "swr";

import { Toaster } from "@/components/ui/sonner";
import type { RouterContext } from "@/router";

import appCss from "@/styles.css?url";

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { title: "Cloudstash — Save links, skim AI summaries" },
      {
        name: "description",
        content:
          "Save links from Telegram, Raycast, iOS, Chrome, or the web. Cloudstash writes a two-paragraph AI summary so you can skim before you read.",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:site_name", content: "Cloudstash" },
      {
        property: "og:title",
        content: "Cloudstash — Save links, skim AI summaries",
      },
      {
        property: "og:description",
        content:
          "Save links from anywhere. Cloudstash writes a short summary on every save so you can skim before you read.",
      },
      {
        property: "og:image",
        content: "https://cloudstash.dev/cloudstash-og.png",
      },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content:
          "Cloudstash inbox showing saved links with AI-generated summaries",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://cloudstash.dev/" },
      { property: "og:locale", content: "en_US" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:title",
        content: "Cloudstash — Save links, skim AI summaries",
      },
      {
        name: "twitter:description",
        content:
          "Save links from anywhere. Cloudstash writes a short summary on every save so you can skim before you read.",
      },
      {
        name: "twitter:image",
        content: "https://cloudstash.dev/cloudstash-og.png",
      },
      {
        name: "twitter:image:alt",
        content:
          "Cloudstash inbox showing saved links with AI-generated summaries",
      },
      { name: "theme-color", content: "#0ea5e9" },
    ],
    links: [
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32x32.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: "/favicon-16x16.png",
      },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "stylesheet", href: appCss },
    ],
    scripts: [
      { src: "https://assets.onedollarstats.com/stonks.js", defer: true },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <SWRConfig
          value={{
            revalidateOnFocus: false,
            errorRetryCount: 3,
            dedupingInterval: 10_000,
          }}
        >
          <Outlet />
          <Toaster position="top-center" />
        </SWRConfig>
        <Scripts />
      </body>
    </html>
  );
}
