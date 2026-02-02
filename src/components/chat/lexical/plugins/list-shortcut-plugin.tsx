import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { ORDERED_LIST, UNORDERED_LIST } from "@lexical/markdown";

// Only list transformers - no BOLD_STAR, ITALIC_STAR, CODE, etc.
const LIST_ONLY_TRANSFORMERS = [UNORDERED_LIST, ORDERED_LIST];

export function ListShortcutPlugin() {
  return <MarkdownShortcutPlugin transformers={LIST_ONLY_TRANSFORMERS} />;
}
