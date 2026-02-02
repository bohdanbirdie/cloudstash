import { useAppStore } from "@/livestore/store";
import { linkByUrl$ } from "@/livestore/queries";

interface LinkMentionProps {
  href: string;
  children: React.ReactNode;
}

export function LinkMention({ href, children }: LinkMentionProps) {
  const store = useAppStore();
  const link = store.useQuery(linkByUrl$(href));

  const childText = typeof children === "string" ? children : null;
  const isPlainUrl = childText === href;

  if (link && isPlainUrl) {
    const displayText = link.title || link.domain;

    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-sm border border-border bg-muted px-1 py-px text-[11px] leading-none font-medium text-foreground no-underline hover:bg-primary hover:border-primary hover:text-primary-foreground transition-colors align-text-bottom"
      >
        {link.favicon && (
          <img src={link.favicon} alt="" className="size-3 rounded-sm" />
        )}
        <span className="max-w-[200px] truncate">{displayText}</span>
      </a>
    );
  }

  return (
    <a
      href={href}
      className="text-primary underline underline-offset-2 break-all hover:text-primary/80"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}
