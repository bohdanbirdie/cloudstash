/**
 * Scoped Bun HTTP servers for the mock-ingest tool, each modelled as an Effect
 * resource (acquire starts Bun.serve, release stops it):
 *   - mockServer: serves a unique realistic page per id (what the cloudstash
 *     worker fetches when extracting metadata).
 *   - echoServer (--dry-run only): a stand-in cloudstash app implementing
 *     POST /api/ingest + GET /api/links so the burst/reconcile/concurrency
 *     logic runs end-to-end without the real worker.
 * Both bind to 127.0.0.1 (not localhost) to match how the worker resolves URLs.
 */

import { Effect, Scope } from "effect";

import { norm } from "./client";
import { buildImage, buildPage } from "./content";

const HOST = "127.0.0.1";

export interface RunningServer {
  origin: string;
  port: number;
}

export const mockServer = (
  port: number
): Effect.Effect<RunningServer, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() => {
      let origin = "";
      const server = Bun.serve({
        port,
        hostname: HOST,
        fetch(req) {
          const url = new URL(req.url);

          const pageMatch = url.pathname.match(/^\/page\/(.+)$/);
          if (pageMatch) {
            const id = decodeURIComponent(pageMatch[1]);
            return new Response(buildPage(id, origin).html, {
              headers: { "Content-Type": "text/html; charset=utf-8" },
            });
          }

          const imgMatch = url.pathname.match(/^\/img\/(.+)$/);
          if (imgMatch) {
            const id = decodeURIComponent(imgMatch[1]);
            return new Response(buildImage(id), {
              headers: { "Content-Type": "image/svg+xml; charset=utf-8" },
            });
          }

          if (url.pathname === "/") {
            return new Response("mock-ingest content server — try /page/1\n", {
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            });
          }
          return new Response("Not found", { status: 404 });
        },
      });
      origin = `http://${HOST}:${server.port}`;
      return { server, origin, port: server.port };
    }),
    ({ server }) => Effect.sync(() => server.stop(true))
  ).pipe(Effect.map((s) => ({ origin: s.origin, port: s.port })));

export const echoServer = (): Effect.Effect<
  RunningServer,
  never,
  Scope.Scope
> =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const received = new Set<string>();
      const server = Bun.serve({
        port: 0,
        hostname: HOST,
        async fetch(req) {
          const url = new URL(req.url);
          const authed = req.headers
            .get("Authorization")
            ?.startsWith("Bearer ");

          if (url.pathname === "/api/ingest" && req.method === "POST") {
            if (!authed) {
              return Response.json(
                { error: "Missing API key" },
                { status: 401 }
              );
            }
            const body = (await req.json().catch(() => ({}))) as {
              url?: string;
            };
            if (!body.url) {
              return Response.json({ error: "Missing url" }, { status: 400 });
            }
            try {
              new URL(body.url);
            } catch {
              return Response.json({ error: "Invalid URL" }, { status: 400 });
            }
            received.add(norm(body.url));
            return Response.json({ status: "queued" });
          }

          if (url.pathname === "/api/links" && req.method === "GET") {
            if (!authed) {
              return Response.json(
                { error: "Missing API key" },
                { status: 401 }
              );
            }
            const limit = Number(url.searchParams.get("limit") ?? "50");
            const all = [...received];
            const cursorRaw = url.searchParams.get("cursor");
            const start = cursorRaw ? Number(atob(cursorRaw)) : 0;
            const slice = all.slice(start, start + limit);
            const end = start + limit;
            return Response.json({
              links: slice.map((u) => ({
                url: u,
                title: "echo",
                summary: null,
                processing: "none",
              })),
              total: all.length,
              nextCursor: end < all.length ? btoa(String(end)) : null,
            });
          }

          return new Response("Not found", { status: 404 });
        },
      });
      return {
        server,
        origin: `http://${HOST}:${server.port}`,
        port: server.port,
      };
    }),
    ({ server }) => Effect.sync(() => server.stop(true))
  ).pipe(Effect.map((s) => ({ origin: s.origin, port: s.port })));
