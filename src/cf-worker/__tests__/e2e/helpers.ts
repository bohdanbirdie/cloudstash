import { env, SELF } from "cloudflare:test";

export interface UserInfo {
  cookie: string;
  userId: string;
  orgId: string;
}

export async function signupUser(
  email: string,
  name: string
): Promise<UserInfo> {
  const res = await SELF.fetch("http://worker/api/auth/sign-up/email", {
    body: JSON.stringify({ email, name, password: "test-password-123" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Signup failed: ${res.status} - ${text}`);
  }

  const cookie = res.headers.get("set-cookie");
  if (!cookie) {
    throw new Error("No session cookie returned from signup");
  }

  const meRes = await SELF.fetch("http://worker/api/auth/me", {
    headers: { Cookie: cookie },
  });

  if (!meRes.ok) {
    const text = await meRes.text();
    throw new Error(`Failed to get /me: ${meRes.status} - ${text}`);
  }

  const me = (await meRes.json()) as {
    user: { id: string };
    session: { activeOrganizationId: string };
  };

  return {
    cookie,
    orgId: me.session.activeOrganizationId,
    userId: me.user.id,
  };
}

export async function makeAdmin(userId: string): Promise<void> {
  await env.DB.prepare("UPDATE user SET role = 'admin' WHERE id = ?")
    .bind(userId)
    .run();
}
