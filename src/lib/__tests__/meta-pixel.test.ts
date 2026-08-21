import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

import { META_PIXEL_INIT_SCRIPT } from "../meta-pixel";

function runMetaPixelScript(globalPrivacyControl: boolean | undefined) {
  const insertBefore = vi.fn();
  const firstScript = { parentNode: { insertBefore } };
  const document = {
    createElement: vi.fn(() => ({})),
    getElementsByTagName: vi.fn(() => [firstScript]),
  };
  const window = {};

  runInNewContext(META_PIXEL_INIT_SCRIPT, {
    document,
    navigator: { globalPrivacyControl },
    window,
  });

  return { document, insertBefore };
}

describe("Meta Pixel", () => {
  it("does not load when Global Privacy Control is enabled", () => {
    const { document, insertBefore } = runMetaPixelScript(true);

    expect(document.createElement).not.toHaveBeenCalled();
    expect(insertBefore).not.toHaveBeenCalled();
  });

  it("loads on an eligible route without Global Privacy Control", () => {
    const { document, insertBefore } = runMetaPixelScript(undefined);

    expect(document.createElement).toHaveBeenCalledWith("script");
    expect(insertBefore).toHaveBeenCalledOnce();
  });
});
