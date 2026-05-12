import { Footer } from "./footer";
import { SHELL } from "./shared";
import { TopBar } from "./top-bar";

export function LegalShell({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <TopBar />
      <main>
        <section className="border-b border-border/60 py-16 sm:py-20">
          <div className={SHELL}>
            <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-primary">
              {eyebrow}
            </div>
            <h1 className="mt-2 text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              {title}
            </h1>
            {lead && (
              <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
                {lead}
              </p>
            )}
          </div>
        </section>
        <section className="py-16 sm:py-20">
          <div
            className={`${SHELL} text-pretty text-sm leading-relaxed text-muted-foreground`}
          >
            {children ?? (
              <p>
                This page is a placeholder. Final content is being drafted and
                will appear here shortly.
              </p>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
