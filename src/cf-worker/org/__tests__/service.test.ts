import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";

import { OrgId, UserId } from "../../db/branded";
import { AccessDeniedError, OrgUpstreamError } from "../errors";
import { classifyFullOrgError } from "../service";

describe("classifyFullOrgError", () => {
  const orgId = OrgId.make("org-1");
  const userId = UserId.make("user-1");

  it("maps a 403 APIError (non-member) to AccessDeniedError", () => {
    const error = new APIError("FORBIDDEN", {
      code: "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION",
      message: "User is not a member of the organization",
    });
    const result = classifyFullOrgError(error, orgId, userId);
    expect(result._tag).toBe("AccessDeniedError");
    expect((result as AccessDeniedError).orgId).toBe(orgId);
    expect((result as AccessDeniedError).userId).toBe(userId);
  });

  it("maps Better Auth's 400 'organization not found' to OrgNotFoundError", () => {
    const error = new APIError("BAD_REQUEST", {
      code: "ORGANIZATION_NOT_FOUND",
      message: "Organization not found",
    });
    const result = classifyFullOrgError(error, orgId, userId);
    expect(result._tag).toBe("OrgNotFoundError");
    expect(result.orgId).toBe(orgId);
  });

  it("maps a 404 APIError to OrgNotFoundError", () => {
    const error = new APIError("NOT_FOUND", { code: "WHATEVER" });
    const result = classifyFullOrgError(error, orgId, userId);
    expect(result._tag).toBe("OrgNotFoundError");
    expect(result.orgId).toBe(orgId);
  });

  it("maps an unexpected APIError status to OrgUpstreamError (not 404)", () => {
    const error = new APIError("UNAUTHORIZED", { code: "WHATEVER" });
    const result = classifyFullOrgError(error, orgId, userId);
    expect(result._tag).toBe("OrgUpstreamError");
    expect((result as OrgUpstreamError).cause).toBe(error);
  });

  it("maps an APIError with no resolvable statusCode to OrgUpstreamError", () => {
    const error = new APIError("FORBIDDEN", { code: "X" });
    (error as { statusCode?: number }).statusCode = undefined as never;
    const result = classifyFullOrgError(error, orgId, userId);
    expect(result._tag).toBe("OrgUpstreamError");
  });

  it("maps a generic (non-API) error to OrgUpstreamError, preserving the cause", () => {
    const error = new Error("network down");
    const result = classifyFullOrgError(error, orgId, userId);
    expect(result._tag).toBe("OrgUpstreamError");
    expect((result as OrgUpstreamError).orgId).toBe(orgId);
    expect((result as OrgUpstreamError).cause).toBe(error);
  });

  it.each([null, undefined, 42, "boom", {}])(
    "maps non-error input %p to OrgUpstreamError",
    (input) => {
      const result = classifyFullOrgError(input, orgId, userId);
      expect(result._tag).toBe("OrgUpstreamError");
    }
  );
});
