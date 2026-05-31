// Web app → extension messaging over `externally_connectable`. Dev and Web
// Store builds have different IDs: the manifest `key` pins the dev ID; the
// Store assigns its own. Prod targets the published ID; VITE_EXTENSION_ID
// overrides for previews.
const DEV_EXTENSION_ID = "eelfhpgegemfgccaakcmfgldcaojadfj";
const PUBLISHED_EXTENSION_ID = "bdommhffamndfanbpnikgmpjncpcobia";

export const EXTENSION_ID =
  (import.meta.env as Record<string, string | undefined>).VITE_EXTENSION_ID ??
  (import.meta.env.PROD ? PUBLISHED_EXTENSION_ID : DEV_EXTENSION_ID);

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

/** True if the extension is installed and responding. */
export async function pingExtension(): Promise<boolean> {
  try {
    const res = await send({ type: "cs:ping" }, PING_TIMEOUT_MS);
    return Boolean((res as { ok?: boolean } | undefined)?.ok);
  } catch {
    return false;
  }
}

/** Hands the minted credentials to the extension. Returns true on ack. */
export async function sendCredsToExtension(
  apiKey: string,
  orgId: string
): Promise<boolean> {
  try {
    const res = await send(
      { type: "cs:connect", apiKey, orgId },
      CONNECT_TIMEOUT_MS
    );
    return Boolean((res as { ok?: boolean } | undefined)?.ok);
  } catch {
    return false;
  }
}
