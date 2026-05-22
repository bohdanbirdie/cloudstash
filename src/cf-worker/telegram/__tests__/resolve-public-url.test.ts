import { describe, expect, it } from "vitest";

import type { Env } from "../../shared";
import { resolvePublicUrl } from "../bot";

const env = (overrides: Partial<Env> = {}): Env => overrides as Env;
const req = (url: string) => new Request(url);

describe("resolvePublicUrl", () => {
  it("prefers env.PUBLIC_URL over the incoming request host", () => {
    expect(
      resolvePublicUrl(
        env({ PUBLIC_URL: "https://cloudstash.dev" }),
        req("https://evil.com/api/telegram")
      )
    ).toBe("https://cloudstash.dev");
  });

  it("strips a trailing slash from env.PUBLIC_URL", () => {
    expect(
      resolvePublicUrl(
        env({ PUBLIC_URL: "https://cloudstash.dev/" }),
        req("https://anything.example/api/telegram")
      )
    ).toBe("https://cloudstash.dev");
  });

  it("falls back to the request origin when PUBLIC_URL is unset", () => {
    expect(
      resolvePublicUrl(
        env(),
        req("https://tunnel.trycloudflare.com/api/telegram")
      )
    ).toBe("https://tunnel.trycloudflare.com");
  });

  it("treats blank PUBLIC_URL as unset", () => {
    expect(
      resolvePublicUrl(
        env({ PUBLIC_URL: "   " }),
        req("https://tunnel.trycloudflare.com/api/telegram")
      )
    ).toBe("https://tunnel.trycloudflare.com");
  });
});
