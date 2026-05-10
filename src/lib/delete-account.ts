import { authClient } from "@/lib/auth";

export type DeleteAccountError =
  | { tag: "session-expired" }
  | { tag: "network"; message: string }
  | { tag: "unknown"; message: string };

/**
 * Resolves with an error tag on failure. On success the caller never sees a
 * resolution — we navigate away first. OPFS is wiped by the login route's
 * mount effect once the auth guard redirects there.
 */
export async function deleteAccount(): Promise<DeleteAccountError | null> {
  try {
    const { error } = await authClient.deleteUser({ callbackURL: "/" });
    if (error?.code === "SESSION_EXPIRED") return { tag: "session-expired" };
    if (error)
      return {
        tag: "unknown",
        message: error.message ?? "Something went wrong.",
      };
    window.location.assign("/");
    return null;
  } catch (cause) {
    return {
      tag: "network",
      message:
        cause instanceof Error && cause.message
          ? cause.message
          : "Network error. Please try again.",
    };
  }
}
