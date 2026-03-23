import { describe, expect, it } from "vitest";

import { decodeHtmlEntities } from "../../metadata/decode-entities";

describe("decodeHtmlEntities", () => {
  it("decodes named entities", () => {
    expect(decodeHtmlEntities("&amp; &lt; &gt; &quot;")).toBe('& < > "');
  });

  it("decodes numeric entities", () => {
    expect(decodeHtmlEntities("doesn&#39;t")).toBe("doesn't");
  });

  it("decodes hex entities", () => {
    expect(decodeHtmlEntities("can&#x27;t")).toBe("can't");
  });

  it("returns plain text unchanged", () => {
    expect(decodeHtmlEntities("Hello world")).toBe("Hello world");
  });

  it("handles a realistic GitHub issue title", () => {
    expect(
      decodeHtmlEntities(
        "`new Worker(&quot;some-package&quot;)` doesn&#39;t load optimized dep"
      )
    ).toBe('`new Worker("some-package")` doesn\'t load optimized dep');
  });
});
