import { render } from "@react-email/render";
import { describe, it, expect } from "vitest";

import { ApprovalEmail } from "../../email/templates/approval-email";

describe("ApprovalEmail", () => {
  it("renders with user name", async () => {
    const html = await render(ApprovalEmail({ name: "John" }));

    expect(html).toContain(">Hi");
    expect(html).toContain("John");
    expect(html).toContain("Welcome to CloudStash!");
    expect(html).toContain("Your CloudStash account has been approved");
  });

  it("renders without name (null)", async () => {
    const html = await render(ApprovalEmail({ name: null }));

    expect(html).toContain(">Hi");
    expect(html).toContain("there");
    expect(html).toContain("Welcome to CloudStash!");
  });

  it("contains login button with correct link", async () => {
    const html = await render(ApprovalEmail({ name: "Test" }));

    expect(html).toContain("Go to CloudStash");
    expect(html).toContain("https://cloudstash.dev");
  });

  it("renders plain text version", async () => {
    const text = await render(ApprovalEmail({ name: "Alice" }), {
      plainText: true,
    });

    expect(text).toContain("Hi Alice,");
    expect(text).toContain("approved");
    expect(text).toContain("cloudstash.dev");
  });

  it("contains preview text", async () => {
    const html = await render(ApprovalEmail({ name: null }));

    expect(html).toContain("Your CloudStash account has been approved!");
  });
});
