import { describe, expect, it } from "vitest";

import { fingerprintId } from "../../log-utils";

describe("fingerprintId", () => {
  it("produces a stable privacy-safe identity witness", async () => {
    const fingerprint = await fingerprintId("abc");

    expect(fingerprint).toBe("ba7816bf8f01cfea414140de5dae2223");
    expect(fingerprint).toHaveLength(32);
    expect(await fingerprintId("different")).not.toBe(fingerprint);
  });
});
