const FENCED_CODE = /```[\s\S]*?```/g;
const INLINE_CODE = /`([^`]+)`/g;
const IMAGE = /!\[([^\]]*)\]\([^)]*\)/g;
const LINK = /\[([^\]]+)\]\([^)]*\)/g;
const BOLD = /(\*\*|__)(.+?)\1/g;
const ITALIC = /(\*|_)(.+?)\1/g;
const STRIKE = /~~(.+?)~~/g;
const HEADER = /^\s{0,3}#{1,6}\s+/gm;
const BLOCKQUOTE = /^\s{0,3}>\s?/gm;
const BULLET = /^\s*[-*+]\s+/gm;
const ORDERED = /^\s*\d+\.\s+/gm;
const HR = /^\s*([-*_])\s*\1\s*\1[\s\S]*?$/gm;
const WS = /\s+/g;

export function stripMarkdown(text: string): string {
  return text
    .replace(FENCED_CODE, "")
    .replace(IMAGE, "$1")
    .replace(LINK, "$1")
    .replace(INLINE_CODE, "$1")
    .replace(STRIKE, "$1")
    .replace(BOLD, "$2")
    .replace(ITALIC, "$2")
    .replace(HR, "")
    .replace(HEADER, "")
    .replace(BLOCKQUOTE, "")
    .replace(BULLET, "")
    .replace(ORDERED, "")
    .replace(WS, " ")
    .trim();
}
