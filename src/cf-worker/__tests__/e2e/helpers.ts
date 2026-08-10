import { env, runInDurableObject, SELF } from "cloudflare:test";

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

export const backendEventlogMax = (storeId: string): Promise<number | null> =>
  env.SYNC_BACKEND_DO.get(
    env.SYNC_BACKEND_DO.idFromName(storeId)
  ).getEventlogMax();

export async function waitForBackendHead(
  storeId: string,
  atLeast: number
): Promise<number> {
  let head = 0;
  for (let i = 0; i < 200; i++) {
    head = (await backendEventlogMax(storeId)) ?? 0;
    if (head >= atLeast) return head;
    await new Promise((r) => setTimeout(r, 75));
  }
  throw new Error(
    `SyncBackend eventlog head stuck at ${head}, wanted >= ${atLeast} for store ${storeId}`
  );
}

// Close the client store's livePull socket first — aborting with it open
// deadlocks abortAllDurableObjects (docs/todos/server-ingest-cold-do-stranding.md).
export async function quiesceLinkProcessor(
  stub: DurableObjectStub
): Promise<void> {
  try {
    await runInDurableObject(stub, async (instance) => {
      const holder = instance as unknown as {
        cachedStore?: { shutdownPromise?: () => Promise<void> };
      };
      await holder.cachedStore?.shutdownPromise?.();
    });
  } catch {
    // best-effort
  }
}
