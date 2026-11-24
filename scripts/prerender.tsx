import { BunRuntime, BunServices } from "@effect/platform-bun";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { Console, Data, Effect, FileSystem, Path, Runtime } from "effect";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";

import { PRERENDERED_PATHS as PATHS } from "../src/lib/prerendered-paths";
import type { PrerenderedPath as RoutePath } from "../src/lib/prerendered-paths";

class PrerenderError extends Data.TaggedError("PrerenderError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// Marketing routes only. We load them directly via Vite SSR so the full
// `routeTree.gen.ts` (which pulls in _authed → livestore → browser-only
// imports) never enters the SSR module graph.
const ROUTE_MODULES: Record<RoutePath, string> = {
  "/": "/src/routes/index.tsx",
  "/privacy": "/src/routes/privacy.tsx",
  "/terms": "/src/routes/terms.tsx",
  "/contact": "/src/routes/contact.tsx",
};

const ROOT_MODULE = "/src/routes/__root.tsx";
const HEAD_MARKER = "<!--prerender:head-->";

function outputPath(path: RoutePath): string {
  return path === "/"
    ? "dist/client/__landing.html"
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
function renderMetaTags(heads: ReadonlyArray<HeadResult>): string[] {
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
  return out;
}

function renderLinkTags(heads: ReadonlyArray<HeadResult>): string[] {
  return heads.flatMap((head) =>
    (head?.links ?? []).map((link) => `<link${renderAttrs(link)} />`)
  );
}

function renderScriptTags(heads: ReadonlyArray<HeadResult>): string[] {
  return heads.flatMap((head) =>
    (head?.scripts ?? []).map((script) => {
      const { children, ...attrs } = script;
      // Escape any literal `</script>` in inline content so a stray
      // closing tag inside JSON-LD / pixel snippets can't terminate
      // the surrounding <script> tag early.
      const safeChildren = (children ?? "").replace(
        /<\/script>/gi,
        "<\\/script>"
      );
      return `<script${renderAttrs(attrs)}>${safeChildren}</script>`;
    })
  );
}

function buildHeadHtml(heads: ReadonlyArray<HeadResult>): string {
  return [
    ...renderMetaTags(heads),
    ...renderLinkTags(heads),
    ...renderScriptTags(heads),
  ].join("\n    ");
}

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const attempt = <A,>(message: string, run: () => Promise<A>) =>
    Effect.tryPromise({
      try: run,
      catch: (cause) => new PrerenderError({ message, cause }),
    });

  // Minimal Vite server for SSR module loading. We deliberately skip the
  // project's vite.config.ts because none of its plugins are needed to compile
  // the marketing route modules for SSR.
  // Force production mode so route-level guards like `META_PIXEL_HEAD_SCRIPTS`
  // (gated on `import.meta.env.PROD`) emit their tracking scripts into the
  // prerendered HTML. `createServer` defaults to a dev server, which resolves
  // `import.meta.env.PROD` to `false`; setting NODE_ENV before instantiation
  // tips Vite's config into production.
  process.env.NODE_ENV = "production";
  const vite = yield* Effect.acquireRelease(
    attempt("Could not start the Vite SSR server", () =>
      createServer({
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
      })
    ),
    (server) => Effect.promise(() => server.close())
  );

  const shell = yield* fs.readFileString("dist/client/index.html");
  if (!shell.includes(HEAD_MARKER)) {
    return yield* new PrerenderError({
      message: `shell HTML missing ${HEAD_MARKER} marker`,
    });
  }

  const rootModule = yield* attempt("Could not load the root route", () =>
    vite.ssrLoadModule(ROOT_MODULE)
  );
  const rootHeadFn: ((ctx: unknown) => HeadResult) | undefined =
    rootModule.Route.options.head;

  const routeModules = yield* attempt(
    "Could not load the marketing routes",
    () => Promise.all(PATHS.map((p) => vite.ssrLoadModule(ROUTE_MODULES[p])))
  );

  // Fresh marketing-only tree. We can't reuse the source routes' file-route
  // wiring (each is already attached to its own __root__, so the router
  // rejects duplicates), so we lift just the bits we need — component and
  // head — onto fresh `createRoute()` entries.
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const children = PATHS.map((routePath, i) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path: routePath,
      component: routeModules[i].Route.options.component,
    })
  );
  const routeTree = rootRoute.addChildren(children);

  for (let i = 0; i < PATHS.length; i++) {
    const routePath = PATHS[i];
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [routePath] }),
      // Mirror the runtime router so <Match> emits TSR's inline scroll
      // restoration script into the prerendered HTML — it runs in <body>
      // before hydration and restores the saved scroll synchronously,
      // preventing the paint-at-top-then-jump on refresh.
      scrollRestoration: true,
    });
    yield* attempt(`Could not load ${routePath}`, () => router.load());
    const html = renderToString(<RouterProvider router={router} />);

    const routeHeadFn: ((ctx: unknown) => HeadResult) | undefined =
      routeModules[i].Route.options.head;
    const heads: HeadResult[] = [];
    if (rootHeadFn) heads.push(rootHeadFn({}));
    if (routeHeadFn) heads.push(routeHeadFn({}));
    const headHtml = buildHeadHtml(heads);

    const out = outputPath(routePath);
    yield* fs.makeDirectory(path.dirname(out), { recursive: true });
    yield* fs.writeFileString(
      out,
      shell
        .replace(HEAD_MARKER, headHtml)
        .replace('<div id="root"></div>', `<div id="root">${html}</div>`)
    );
    yield* Console.log(`prerendered ${routePath} -> ${out}`);
  }

  yield* fs.writeFileString(
    "dist/client/index.html",
    shell.replace(HEAD_MARKER, "")
  );
  yield* Console.log("wrote empty SPA shell -> dist/client/index.html");
});

// Explicit exit on success — Vite occasionally leaves miniflare /
// workerd handles open in the SSR server even after `vite.close()`,
// and the build has hung in CI before (see commit 704b131).
BunRuntime.runMain(
  program.pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  {
    teardown: (exit) =>
      Runtime.defaultTeardown(exit, (code) => process.exit(code)),
  }
);
