import { describe, expect, it } from "vitest";

import { formatPayload } from "../../link-processor/services/source-notifier.live";

describe("formatPayload", () => {
  it("returns plain success for completed with no summary or tags", () => {
    expect(
      formatPayload({ processingStatus: "completed", summary: null, suggestedTags: [] })
    ).toBe("Link saved!");
  });

  it("includes summary in blockquote", () => {
    expect(
      formatPayload({
        processingStatus: "completed",
        summary: "An article about streaming",
        suggestedTags: [],
      })
    ).toBe("Link saved!\n\n<blockquote>An article about streaming</blockquote>");
  });

  it("includes tags as hashtags", () => {
    expect(
      formatPayload({
        processingStatus: "completed",
        summary: null,
        suggestedTags: ["dev tools", "api", "ci-cd"],
      })
    ).toBe("Link saved!\n\n#dev_tools #api #ci_cd");
  });

  it("includes summary and tags together", () => {
    expect(
      formatPayload({
        processingStatus: "completed",
        summary: "A great article",
        suggestedTags: ["reading"],
      })
    ).toBe(
      "Link saved!\n\n<blockquote>A great article</blockquote>\n\n#reading"
    );
  });

  it("escapes HTML in summary", () => {
    expect(
      formatPayload({
        processingStatus: "completed",
        summary: "Use <script> & stuff",
        suggestedTags: [],
      })
    ).toBe(
      "Link saved!\n\n<blockquote>Use &lt;script&gt; &amp; stuff</blockquote>"
    );
  });

  it("returns enrichment failed message for failed status", () => {
    expect(
      formatPayload({ processingStatus: "failed", summary: null, suggestedTags: [] })
    ).toBe("Link saved, but enrichment failed (metadata/summary unavailable).");
  });
});
