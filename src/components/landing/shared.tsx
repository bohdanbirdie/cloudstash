import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

export const SHELL = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";

export function LandingEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-primary">
      {children}
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lead?: string;
}) {
  return (
    <div className="mb-10 max-w-2xl">
      <LandingEyebrow>{eyebrow}</LandingEyebrow>
      <h2 className="mt-2 text-balance text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
        {title}
      </h2>
      {lead && (
        <p className="mt-3 max-w-[60ch] text-pretty text-sm leading-relaxed text-muted-foreground">
          {lead}
        </p>
      )}
    </div>
  );
}

export function SectionCta({
  label = "Save your first link",
}: {
  label?: string;
}) {
  return (
    <div className="mt-16 flex justify-center sm:mt-20 lg:mt-24">
      <Button
        render={<Link to="/login" />}
        size="lg"
        className="h-11 px-6 text-sm"
      >
        {label}
      </Button>
    </div>
  );
}
