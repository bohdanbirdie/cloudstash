import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";

const DESCRIPTION_ALLOWED_ELEMENTS = ["p", "em", "a", "br"];

const DESCRIPTION_COMPONENTS = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="my-0">{children}</p>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
    if (!href) return <span>{children}</span>;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="underline decoration-1 underline-offset-2 transition-colors hover:text-foreground"
      >
        {children}
      </a>
    );
  },
};

export function DescriptionBody({ text }: { text: string }) {
  return (
    <div className="text-sm leading-relaxed text-muted-foreground text-pretty">
      <ReactMarkdown
        remarkPlugins={[remarkBreaks]}
        allowedElements={DESCRIPTION_ALLOWED_ELEMENTS}
        unwrapDisallowed
        components={DESCRIPTION_COMPONENTS}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
