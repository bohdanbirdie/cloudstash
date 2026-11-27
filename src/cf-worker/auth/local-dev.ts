const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

const isLoopback = (url: string | undefined) => {
  if (!url) return false;
  try {
    return LOOPBACK_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
};

// Browsers share cookies across the ports of one host, so every local dev
// server on 127.0.0.1 would overwrite the others' session. A server on a
// loopback address with an explicit port names its cookies after the port.
export const localCookiePrefix = (baseURL: string): string | undefined => {
  if (!isLoopback(baseURL)) return undefined;
  const { port } = new URL(baseURL);
  return port ? `cloudstash-${port}` : undefined;
};

// The local Google stand-in (`scripts/dev.ts` starts it). Only a loopback
// server with a loopback emulator uses it; alchemy.run.ts passes the variable
// on local stages only.
export const googleEmulatorURL = (env: {
  BETTER_AUTH_URL?: string;
  GOOGLE_EMULATOR_URL?: string;
}): string | undefined => {
  const url = env.GOOGLE_EMULATOR_URL?.replace(/\/+$/, "");
  if (!url || !isLoopback(url) || !isLoopback(env.BETTER_AUTH_URL)) {
    return undefined;
  }
  return url;
};
