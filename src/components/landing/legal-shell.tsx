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

const ARTICLE_CLASSES = [
  "prose prose-sm max-w-[70ch]",
  "prose-headings:text-foreground prose-headings:tracking-tight prose-headings:font-semibold",
  "prose-h2:text-lg prose-h2:mt-12 prose-h2:mb-4",
  "prose-p:text-muted-foreground prose-p:text-pretty",
  "prose-strong:text-foreground prose-strong:font-semibold",
  "prose-a:text-foreground prose-a:font-normal prose-a:underline prose-a:decoration-border prose-a:underline-offset-4 prose-a:transition-colors hover:prose-a:decoration-foreground",
  "prose-ul:text-muted-foreground prose-ol:text-muted-foreground",
  "prose-li:text-pretty prose-li:marker:text-border",
  "[&_section]:scroll-mt-24",
  "[&_section+section]:mt-10",
  "[&_address]:not-italic [&_address]:text-muted-foreground",
].join(" ");

export function LegalArticle({ children }: { children: React.ReactNode }) {
  return <article className={ARTICLE_CLASSES}>{children}</article>;
}

export function LegalUpdated({ date }: { date: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
      Last updated · {date}
    </p>
  );
}

export function LegalAddress() {
  return (
    <address className="mt-3 text-pretty leading-relaxed">
      <strong>Phantom Edtech LLC</strong>
      <br />
      701 Tillery Street, Unit 12-2985
      <br />
      Austin, Texas 78702, United States
      <br />
      <a href="mailto:support@cloudstash.dev">support@cloudstash.dev</a>
    </address>
  );
}
