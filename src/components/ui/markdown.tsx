import { marked } from "marked";
import { memo, useId, useMemo } from "react";
import ReactMarkdown, { Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

import { LinkMention } from "./link-mention";

export type MarkdownProps = {
  children: string;
  id?: string;
  className?: string;
  components?: Partial<Components>;
};

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const tokens = marked.lexer(markdown);
  return tokens.map((token) => token.raw);
}

const INITIAL_COMPONENTS: Partial<Components> = {
  h1: function H1Component({ children }) {
    return (
      <h1 className="text-xl font-bold mt-0 mb-3 first:mt-0">{children}</h1>
    );
  },
  h2: function H2Component({ children }) {
    return <h2 className="text-base font-bold mt-6 mb-3">{children}</h2>;
  },
  h3: function H3Component({ children }) {
    return <h3 className="text-sm font-bold mt-4 mb-2">{children}</h3>;
  },
  hr: function HrComponent() {
    return <hr className="my-6 border-t border-border" />;
  },
  p: function ParagraphComponent({ children }) {
    return <p className="my-2 leading-relaxed">{children}</p>;
  },
  ul: function UnorderedListComponent({ children }) {
    return (
      <ul className="my-3 list-none space-y-1.5 [&>li]:flex [&>li]:items-start [&>li]:gap-2.5 [&>li]:before:mt-[0.65em] [&>li]:before:size-1 [&>li]:before:shrink-0 [&>li]:before:rounded-full [&>li]:before:bg-muted-foreground/45 [&>li]:before:content-['']">
        {children}
      </ul>
    );
  },
  ol: function OrderedListComponent({ children }) {
    return (
      <ol className="my-3 list-outside list-decimal space-y-1.5 ps-5 marker:text-xs marker:font-medium marker:text-muted-foreground/60">
        {children}
      </ol>
    );
  },
  li: function ListItemComponent({ children }) {
    return (
      <li className="min-w-0 leading-relaxed">
        <span className="min-w-0">{children}</span>
      </li>
    );
  },
  a: function AnchorComponent({ href, children }) {
    if (!href) {
      return <span>{children}</span>;
    }
    return <LinkMention href={href}>{children}</LinkMention>;
  },
  code: function CodeComponent({ className, children, node, ...props }) {
    const isInline =
      !node?.position?.start.line ||
      node.position.start.line === node.position.end.line;

    if (isInline) {
      return (
        <span
          className={cn(
            "bg-primary-foreground rounded-sm px-1 font-mono text-[0.9em]",
            className
          )}
          {...props}
        >
          {children}
        </span>
      );
    }

    return (
      <code
        className={cn(
          "block min-w-max p-3 font-mono text-[13px] leading-relaxed text-foreground",
          className
        )}
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: function PreComponent({ children }) {
    return (
      <pre className="my-3 max-w-full overflow-x-auto rounded-lg border border-border bg-muted/40">
        {children}
      </pre>
    );
  },
};

const MemoizedMarkdownBlock = memo(
  function MarkdownBlock({
    content,
    components = INITIAL_COMPONENTS,
  }: {
    content: string;
    components?: Partial<Components>;
  }) {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    );
  },
  function propsAreEqual(prevProps, nextProps) {
    return (
      prevProps.content === nextProps.content &&
      prevProps.components === nextProps.components
    );
  }
);

MemoizedMarkdownBlock.displayName = "MemoizedMarkdownBlock";

function MarkdownComponent({
  children,
  id,
  className,
  components,
}: MarkdownProps) {
  const generatedId = useId();
  const blockId = id ?? generatedId;
  const blocks = useMemo(() => parseMarkdownIntoBlocks(children), [children]);
  const resolvedComponents = useMemo(
    () =>
      components
        ? { ...INITIAL_COMPONENTS, ...components }
        : INITIAL_COMPONENTS,
    [components]
  );

  return (
    <div className={className}>
      {blocks.map((block, index) => (
        <MemoizedMarkdownBlock
          key={`${blockId}-block-${index}`}
          content={block}
          components={resolvedComponents}
        />
      ))}
    </div>
  );
}

const Markdown = memo(MarkdownComponent);
Markdown.displayName = "Markdown";

export { Markdown };
