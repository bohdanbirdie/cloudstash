import { Effect } from "effect";

import type { Extractor } from "./types";

function buildTitle(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const [owner, repo, section, number] = parts;

  const isNumberedSection =
    (section === "issues" || section === "pull" || section === "discussions") &&
    /^\d+$/.test(number ?? "");
  if (isNumberedSection) return `${owner}/${repo}#${number}`;

  return `${owner}/${repo}`;
}

export const githubExtractor: Extractor = {
  name: "github",
  authoritative: false,
  extract: (url: URL) =>
    Effect.sync(() => {
      const title = buildTitle(url.pathname);
      return title ? { title } : null;
    }).pipe(Effect.withSpan("extractor.github.extract")),
};
