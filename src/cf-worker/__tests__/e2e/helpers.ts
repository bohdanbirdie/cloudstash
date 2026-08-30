import { env, runInDurableObject, SELF } from "cloudflare:test";
import { Effect } from "effect";

import type { ChatAgentDO } from "../../chat-agent";
import { CHAT_MODEL_PROVIDER_TEST_OVERRIDE } from "../../chat-agent";
import { makeChatModelProvider } from "../../chat-agent/model-provider";
import type { LinkProcessorDO } from "../../link-processor";
import { METADATA_FETCHER_TEST_OVERRIDE } from "../../link-processor/durable-object";
import { MetadataFetcher } from "../../link-processor/services";
import { OgMetadata } from "../../metadata/schema";

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

export const installTestMetadataFetcher = (
  stub: DurableObjectStub<LinkProcessorDO>,
  onFetch: (url: string) => void = () => undefined
): Promise<void> =>
  runInDurableObject(stub, (instance) => {
    instance[METADATA_FETCHER_TEST_OVERRIDE](
      MetadataFetcher.of({
        fetch: (url) =>
          Effect.sync(() => {
            onFetch(url);
            return new OgMetadata({
              title: new URL(url).pathname.slice(1) || "Saved link",
            });
          }),
      })
    );
  });

export const installTestChatModelProvider = (
  stub: DurableObjectStub<ChatAgentDO>,
  fetcher: typeof fetch
): Promise<void> =>
  runInDurableObject(stub, (instance) =>
    instance[CHAT_MODEL_PROVIDER_TEST_OVERRIDE](
      makeChatModelProvider("test-openrouter-api-key", fetcher)
    )
  );

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
