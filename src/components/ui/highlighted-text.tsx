import { getHighlightParts } from "@/lib/highlight";
import { cn } from "@/lib/utils";

interface HighlightedTextProps {
  text: string | null | undefined;
  query: string;
  className?: string;
  highlightClassName?: string;
}

export function HighlightedText({
  text,
  query,
  className,
  highlightClassName = "bg-primary/15 dark:bg-primary/25 rounded-sm px-0.5",
}: HighlightedTextProps) {
  const parts = getHighlightParts(text, query);

  if (!text) return null;

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.highlighted ? (
          <mark key={i} className={cn("bg-transparent", highlightClassName)}>
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  );
}
