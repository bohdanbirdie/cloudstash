import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  ssr: true,
  component: LandingPage,
});

function LandingPage() {
  return (
    <main className="bg-background text-foreground flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="flex w-full max-w-2xl flex-col items-center gap-8 text-center">
        <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
          Alpha
        </span>
        <h1 className="text-5xl font-bold tracking-tight md:text-6xl">
          cloudstash
        </h1>
        <p className="text-muted-foreground text-balance text-lg md:text-xl">
          Save links. Read later. AI-powered summaries.
        </p>
        <div className="flex gap-3">
          <Link
            to="/login"
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-5 py-2.5 text-sm font-medium transition-colors"
          >
            Get started
          </Link>
        </div>
      </div>
    </main>
  );
}
