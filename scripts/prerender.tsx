import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";

import { PRERENDERED_PATHS as PATHS } from "../src/lib/prerendered-paths";
import type { PrerenderedPath as Path } from "../src/lib/prerendered-paths";

// Marketing routes only. We load them directly via Vite SSR so the full
// `routeTree.gen.ts` (which pulls in _authed → livestore → browser-only
// imports) never enters the SSR module graph.
const ROUTE_MODULES: Record<Path, string> = {
  "/": "/src/routes/index.tsx",
  "/privacy": "/src/routes/privacy.tsx",
  "/terms": "/src/routes/terms.tsx",
  "/contact": "/src/routes/contact.tsx",
};

const ROOT_MODULE = "/src/routes/__root.tsx";
const HEAD_MARKER = "<!--prerender:head-->";

function outputPath(path: Path): string {
  return path === "/"
    ? "dist/client/index.html"
    : `dist/client${path}/index.html`;
}

interface MetaTag {
  title?: string;
  [k: string]: string | undefined;
}

interface LinkTag {
  rel?: string;
  href?: string;
  [k: string]: string | undefined;
}

interface ScriptTag {
  src?: string;
  type?: string;
  children?: string;
  defer?: boolean;
  async?: boolean;
  [k: string]: string | boolean | undefined;
}

interface HeadResult {
  meta?: ReadonlyArray<MetaTag>;
  links?: ReadonlyArray<LinkTag>;
  scripts?: ReadonlyArray<ScriptTag>;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderAttrs(
  attrs: Record<string, string | boolean | undefined>
): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(attrs)) {
    if (val === undefined || val === null || val === false) continue;
    if (val === true) {
      parts.push(key);
      continue;
    }
    parts.push(`${key}="${escapeAttr(val)}"`);
  }
  return parts.length ? " " + parts.join(" ") : "";
}

// Mirrors TanStack Router's `buildTagsFromMatches`: walk matches leaf→root,
// keep the first title and dedupe meta by name/property. Title gets emitted
// last so it overrides any earlier <title> if a browser scans loosely.
function buildHeadHtml(heads: ReadonlyArray<HeadResult>): string {
  const out: string[] = [];
  const seenAttr = new Set<string>();
  let title: string | undefined;

  for (let i = heads.length - 1; i >= 0; i--) {
    const metas = heads[i]?.meta ?? [];
    for (let j = metas.length - 1; j >= 0; j--) {
      const m = metas[j];
      if (!m) continue;
      if (m.title) {
        if (!title) title = m.title;
        continue;
      }
      const attribute = m.name ?? m.property;
      if (attribute) {
        if (seenAttr.has(attribute)) continue;
        seenAttr.add(attribute);
      }
      out.push(`<meta${renderAttrs(m)} />`);
    }
  }
  out.reverse();

  if (title) out.push(`<title>${escapeHtml(title)}</title>`);

  for (const head of heads) {
    for (const link of head?.links ?? []) {
      out.push(`<link${renderAttrs(link)} />`);
    }
  }

  for (const head of heads) {
    for (const script of head?.scripts ?? []) {
      const { children, ...attrs } = script;
      // Escape any literal `</script>` in inline content so a stray
      // closing tag inside JSON-LD / pixel snippets can't terminate
      // the surrounding <script> tag early.
      const safeChildren = (children ?? "").replace(
        /<\/script>/gi,
        "<\\/script>"
      );
      out.push(`<script${renderAttrs(attrs)}>${safeChildren}</script>`);
    }
  }

  return out.join("\n    ");
}

async function main(): Promise<void> {
  // Minimal Vite server for SSR module loading. We deliberately skip the
  // project's vite.config.ts (cloudflare plugin, tailwind, react-router-plugin)
  // because none of those are needed to compile the marketing route modules
  // for SSR, and the cloudflare plugin tries to open a wrangler remote
  // connection at startup which fails in this Node-only context.
  // Force production mode so route-level guards like `META_PIXEL_HEAD_SCRIPTS`
  // (gated on `import.meta.env.PROD`) emit their tracking scripts into the
  // prerendered HTML. `createServer` defaults to a dev server, which resolves
  // `import.meta.env.PROD` to `false`; setting NODE_ENV before instantiation
  // tips Vite's config into production.
  process.env.NODE_ENV = "production";
  const vite = await createServer({
    configFile: false,
    mode: "production",
    server: { middlewareMode: true },
    appType: "custom",
    resolve: { tsconfigPaths: true },
    define: {
      "import.meta.env.PROD": "true",
      "import.meta.env.DEV": "false",
      "import.meta.env.MODE": '"production"',
    },
  });

  try {
    const shell = await readFile("dist/client/index.html", "utf-8");
    if (!shell.includes(HEAD_MARKER)) {
      throw new Error(`shell HTML missing ${HEAD_MARKER} marker`);
    }

    const rootModule = await vite.ssrLoadModule(ROOT_MODULE);
    const rootHeadFn: ((ctx: unknown) => HeadResult) | undefined =
      rootModule.Route.options.head;

    const routeModules = await Promise.all(
      PATHS.map((p) => vite.ssrLoadModule(ROUTE_MODULES[p]))
    );

    // Fresh marketing-only tree. We can't reuse the source routes' file-route
    // wiring (each is already attached to its own __root__, so the router
    // rejects duplicates), so we lift just the bits we need — component and
    // head — onto fresh `createRoute()` entries.
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const children = PATHS.map((path, i) =>
      createRoute({
        getParentRoute: () => rootRoute,
        path,
        component: routeModules[i].Route.options.component,
      })
    );
    const routeTree = rootRoute.addChildren(children);

    for (let i = 0; i < PATHS.length; i++) {
      const path = PATHS[i];
      const router = createRouter({
        routeTree,
        history: createMemoryHistory({ initialEntries: [path] }),
      });
      await router.load();
      const html = renderToString(<RouterProvider router={router} />);

      const routeHeadFn: ((ctx: unknown) => HeadResult) | undefined =
        routeModules[i].Route.options.head;
      const heads: HeadResult[] = [];
      if (rootHeadFn) heads.push(rootHeadFn({}));
      if (routeHeadFn) heads.push(routeHeadFn({}));
      const headHtml = buildHeadHtml(heads);

      const out = outputPath(path);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(
        out,
        shell
          .replace(HEAD_MARKER, headHtml)
          .replace('<div id="root"></div>', `<div id="root">${html}</div>`)
      );
      console.log(`prerendered ${path} -> ${out}`);
    }
  } finally {
    await vite.close();
  }
}

// Explicit exit on success — Vite occasionally leaves miniflare /
// workerd handles open in the SSR server even after `vite.close()`,
// and the build has hung in CI before (see commit 704b131).
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
