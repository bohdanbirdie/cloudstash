import { describe, expect, it } from "vitest";

import { API_ENDPOINTS, buildAgentSpec } from "../api-spec";

const ORIGIN = "https://app.example.com";

describe("API_ENDPOINTS", () => {
  it("covers the public endpoints", () => {
    expect(API_ENDPOINTS.map((e) => `${e.method} ${e.path}`)).toEqual([
      "GET /api/links",
      "POST /api/ingest",
    ]);
  });

  it("builds curl with the live origin and a bearer header", () => {
    for (const endpoint of API_ENDPOINTS) {
      const curl = endpoint.curl(ORIGIN);
      expect(curl).toContain(`${ORIGIN}${endpoint.path}`);
      expect(curl).toContain("Authorization: Bearer $CLOUDSTASH_API_KEY");
    }
  });
});

describe("buildAgentSpec", () => {
  it("is a self-contained spec keyed to the origin", () => {
    const spec = buildAgentSpec(ORIGIN);
    expect(spec).toContain("# Cloudstash API");
    expect(spec).toContain(`Base URL: ${ORIGIN}`);
    expect(spec).toContain("Authorization: Bearer <API_KEY>");
    expect(spec).toContain("available on Plus and Pro");
  });

  it("documents every endpoint, its params, and errors", () => {
    const spec = buildAgentSpec(ORIGIN);
    for (const endpoint of API_ENDPOINTS) {
      expect(spec).toContain(
        `## ${endpoint.method} ${endpoint.path} — ${endpoint.summary}`
      );
      for (const field of [
        ...(endpoint.query ?? []),
        ...(endpoint.body ?? []),
      ]) {
        expect(spec).toContain(field.name);
      }
      for (const err of endpoint.errors) {
        expect(spec).toContain(`- ${err.status} — ${err.when}`);
      }
    }
  });

  it("explains cursor pagination for the list endpoint", () => {
    const spec = buildAgentSpec(ORIGIN);
    expect(spec).toContain("nextCursor");
    expect(spec).toContain(
      "keep passing the returned nextCursor until it is null"
    );
  });
});
