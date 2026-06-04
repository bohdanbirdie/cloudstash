// Two hard-coded IDs: the manifest `key` pins the dev (unpacked) ID; the Web
// Store assigns its own published ID. Prod targets the published one;
// VITE_EXTENSION_ID overrides for previews.
const DEV_EXTENSION_ID = "eelfhpgegemfgccaakcmfgldcaojadfj";
const PUBLISHED_EXTENSION_ID = "bdommhffamndfanbpnikgmpjncpcobia";

const EXTENSION_ID =
  (import.meta.env as Record<string, string | undefined>).VITE_EXTENSION_ID ??
  (import.meta.env.PROD ? PUBLISHED_EXTENSION_ID : DEV_EXTENSION_ID);

export const CHROME_WEB_STORE_URL = `https://chromewebstore.google.com/detail/cloudstash/${PUBLISHED_EXTENSION_ID}`;

interface ExternalRuntime {
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback: (response: unknown) => void
  ) => void;
  lastError?: { message?: string };
}

const runtime = (globalThis as { chrome?: { runtime?: ExternalRuntime } })
  .chrome?.runtime;

const PING_TIMEOUT_MS = 1500;
const CONNECT_TIMEOUT_MS = 5000;

function send(message: unknown, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!runtime?.sendMessage) {
      reject(new Error("extension-unavailable"));
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("extension-timeout"));
    }, timeoutMs);
    try {
      runtime.sendMessage(EXTENSION_ID, message, (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (runtime.lastError) {
          reject(new Error(runtime.lastError.message ?? "extension-error"));
          return;
        }
        resolve(response);
      });
    } catch (err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error("extension-error"));
    }
  });
}

async function sendForAck(
  message: unknown,
  timeoutMs: number
): Promise<boolean> {
  try {
    const res = await send(message, timeoutMs);
    return Boolean((res as { ok?: boolean } | undefined)?.ok);
  } catch {
    return false;
  }
}

export const pingExtension = (): Promise<boolean> =>
  sendForAck({ type: "cs:ping" }, PING_TIMEOUT_MS);

export const sendCredsToExtension = (
  apiKey: string,
  orgId: string
): Promise<boolean> =>
  sendForAck({ type: "cs:connect", apiKey, orgId }, CONNECT_TIMEOUT_MS);
