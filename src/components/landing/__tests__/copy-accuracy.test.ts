import { describe, expect, it } from "vitest";

import { PLANS } from "@/lib/plan";

import { FAQ_ITEMS } from "../faq-data";
import { FAQ_LD, SOFTWARE_APPLICATION_LD } from "../seo-data";

describe("customer copy projections", () => {
  it("keeps structured FAQ data aligned with the visible FAQ", () => {
    expect(
      FAQ_LD.mainEntity.map(({ name, acceptedAnswer }) => ({
        q: name,
        a: acceptedAnswer.text,
      }))
    ).toEqual(FAQ_ITEMS);
  });

  it("keeps structured plan prices aligned with executable plans", () => {
    const offers = new Map(
      SOFTWARE_APPLICATION_LD.offers.map((offer) => [offer.name, offer.price])
    );

    expect(offers.get("Free")).toBe("0");
    expect(offers.get("Plus")).toBe(String(PLANS.plus.pricing?.monthly));
    expect(offers.get("Pro")).toBe(String(PLANS.pro.pricing?.monthly));
  });

  it("does not restore known absolute summary or deletion promises", () => {
    const copy = JSON.stringify({ FAQ_ITEMS, PLANS, SOFTWARE_APPLICATION_LD });

    expect(copy).not.toMatch(/two-paragraph|summary on every save/i);
    expect(copy).not.toMatch(/wiped immediately|don’t hold onto anything/i);
    expect(copy).not.toMatch(/\bVault\b|\bworkspace\b/i);
  });
});
