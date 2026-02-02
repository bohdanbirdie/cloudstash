import React, { useEffect, useState } from "react";
import { codeToHtml } from "shiki";

import { cn } from "@/lib/utils";

export type CodeBlockProps = {
  children?: React.ReactNode;
  className?: string;
} & React.HTMLProps<HTMLDivElement>;

function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  return (
    <div
      className={cn(
        "not-prose flex min-w-0 max-w-full flex-col overflow-hidden border",
        "border-border bg-card text-card-foreground rounded-xl",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export type CodeBlockCodeProps = {
  code: string;
  language?: string;
  theme?: string;
  className?: string;
} & React.HTMLProps<HTMLDivElement>;

function CodeBlockCode({
  code,
  language = "tsx",
  theme = "github-light",
  className,
  ...props
}: CodeBlockCodeProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);

  useEffect(() => {
    async function highlight() {
      if (!code) {
        setHighlightedHtml("<pre><code></code></pre>");
        return;
      }

      const html = await codeToHtml(code, { lang: language, theme });
      setHighlightedHtml(html);
    }
    highlight();
  }, [code, language, theme]);

  if (!highlightedHtml) return null;

  return (
    <div
      className={cn(
        "w-full text-[13px] [&>pre]:px-4 [&>pre]:py-4 [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_code]:break-words",
        className
      )}
      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      {...props}
    />
  );
}

export type CodeBlockGroupProps = React.HTMLAttributes<HTMLDivElement>;

function CodeBlockGroup({
  children,
  className,
  ...props
}: CodeBlockGroupProps) {
  return (
    <div
      className={cn("flex items-center justify-between", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export { CodeBlockGroup, CodeBlockCode, CodeBlock };
