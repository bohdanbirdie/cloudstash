import ReactMarkdown, { Components } from "react-markdown";
import { cn } from "@/lib/utils";

interface MarkdownProps {
  children: string;
  className?: string;
}

const components: Components = {
  p: ({ children }) => <p className="leading-relaxed my-2 first:mt-0 last:mb-0">{children}</p>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 hover:text-primary/80"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => (
    <code className="bg-muted px-1 py-0.5 rounded text-xs">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="bg-muted p-3 rounded text-xs overflow-x-auto my-2">{children}</pre>
  ),
  ul: ({ children }) => <ul className="list-disc list-inside my-2 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside my-2 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-primary/50 pl-3 italic my-2">{children}</blockquote>
  ),
  h1: ({ children }) => <h1 className="text-lg font-medium tracking-tight mt-4 mb-2">{children}</h1>,
  h2: ({ children }) => <h2 className="text-base font-medium tracking-tight mt-3 mb-2">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-medium tracking-tight mt-2 mb-1">{children}</h3>,
};

export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={cn("text-sm", className)}>
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  );
}
