import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_PATH = path.resolve(__dirname, "../../src");

const APP_URL_VALUE = process.env.WXT_APP_URL ?? "https://cloudstash.dev";
const SYNC_URL_VALUE =
  APP_URL_VALUE.replace(/^http/, "ws").replace(/\/+$/, "") + "/sync";

const IS_LOCAL_BUILD = /localhost|127\.0\.0\.1/.test(APP_URL_VALUE);
const HOST_PERMISSIONS = IS_LOCAL_BUILD
  ? ["http://localhost:3000/*", "http://127.0.0.1:3000/*"]
  : ["https://cloudstash.dev/*"];

// Pins the UNPACKED (local/dev) extension ID to a key we control, so the local
// web app can reach a known `chrome.runtime.sendMessage(EXT_ID, …)` for the
// session handoff. Public key is safe to commit; private key lives in
// apps/extension/.keys (gitignored). Local ID: eelfhpgegemfgccaakcmfgldcaojadfj
//
// NOTE: the Chrome Web Store REJECTS a `key` field ("key field is not allowed
// in manifest") and assigns the published extension its own ID. So `key` is
// injected only for local builds (below) and omitted from store builds. The
// CWS-assigned (published) ID is bdommhffamndfanbpnikgmpjncpcobia — already
// wired into the worker EXTENSION_ID_ALLOWLIST (wrangler.jsonc) and the web
// app's prod default (src/lib/extension-connect.ts).
const DEV_EXTENSION_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtEVUr7MrQOO/WqAV6eBMrR8E7y+pPh/Iu1cG5cs/ebMFdT31GYEEVRz8iaqHxTZMOL8IloAgorLcbSz1S2JaDbZZCvD3I4I51K0dxp4I6WwNI2ER+OMiDnVkdkEwjUNwlQRqHHJV/o2ualZXYEjZTsDlcknynSAMfEOlLlTErFuUhwbVE0iEtmD/h59PYeYoa3OZE7EgNbRPTkibnujB5cK5m4Qap21s292mEpBnLHi1ujuLOF02Tj/6UE3rnZc5BwHOK+Xt/SenSXXC5yN4vRIBulb6HXwkpNyeHcm6d0XvGwk9HYJZHW8DJ0AeTESl/E+yAoWgyHKTjRGTuKiARQIDAQAB";
const EXTENSION_KEY = process.env.WXT_EXTENSION_PUBLIC_KEY ?? DEV_EXTENSION_KEY;

const EXTERNALLY_CONNECTABLE_MATCHES = IS_LOCAL_BUILD
  ? ["http://localhost:3000/*", "http://127.0.0.1:3000/*"]
  : ["https://cloudstash.dev/*"];

const replaceUrlsPlugin = () => ({
  name: "cs-replace-urls",
  enforce: "pre" as const,
  transform(code: string) {
    if (
      !code.includes("__CLOUDSTASH_APP_URL__") &&
      !code.includes("__CLOUDSTASH_SYNC_URL__")
    ) {
      return null;
    }
    return {
      code: code
        .replaceAll('"__CLOUDSTASH_APP_URL__"', JSON.stringify(APP_URL_VALUE))
        .replaceAll(
          '"__CLOUDSTASH_SYNC_URL__"',
          JSON.stringify(SYNC_URL_VALUE)
        ),
      map: null,
    };
  },
});

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: ".",
  alias: {
    "@web": SRC_PATH,
  },
  manifest: {
    name: "Cloudstash",
    description: "Save links to Cloudstash from any page.",
    homepage_url: "https://cloudstash.dev",
    ...(IS_LOCAL_BUILD ? { key: EXTENSION_KEY } : {}),
    permissions: ["offscreen", "storage", "unlimitedStorage", "tabs"],
    host_permissions: HOST_PERMISSIONS,
    externally_connectable: { matches: EXTERNALLY_CONNECTABLE_MATCHES },
    action: {
      default_title: "Save to Cloudstash",
      default_popup: "popup.html",
    },
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
  },
  vite: () => ({
    plugins: [tailwindcss(), replaceUrlsPlugin()],
    worker: {
      plugins: () => [replaceUrlsPlugin()],
    },
  }),
});
