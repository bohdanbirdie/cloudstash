import { describe, expect, it } from "vitest";

import { parseHttpUrl } from "../http-url";

describe("parseHttpUrl", () => {
  it("accepts http URLs", () => {
    const url = parseHttpUrl("http://example.com/path");
    expect(url?.href).toBe("http://example.com/path");
    expect(url?.protocol).toBe("http:");
  });

  it("accepts https URLs", () => {
    const url = parseHttpUrl("https://example.com");
    expect(url?.href).toBe("https://example.com/");
    expect(url?.protocol).toBe("https:");
  });

  it.each([
    ["javascript:alert(1)", "javascript"],
    ["data:text/html,<script>", "data"],
    ["vbscript:msgbox", "vbscript"],
    ["file:///etc/passwd", "file"],
    ["ftp://example.com", "ftp"],
    ["mailto:test@example.com", "mailto"],
    ["chrome://settings", "chrome"],
  ])("rejects %s", (input) => {
    expect(parseHttpUrl(input)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(parseHttpUrl("not a url")).toBeNull();
    expect(parseHttpUrl("")).toBeNull();
    expect(parseHttpUrl("http://")).toBeNull();
  });

  it("normalizes the URL (lowercases host, default ports stripped)", () => {
    const url = parseHttpUrl("HTTPS://Example.COM:443/PATH");
    expect(url?.host).toBe("example.com");
    expect(url?.pathname).toBe("/PATH");
    expect(url?.port).toBe("");
  });
});
