export const FAQ_ITEMS: readonly { q: string; a: string }[] = [
  {
    q: "Where does my data live?",
    a: "Cloudstash stores your library on Cloudflare and syncs it to every device you sign in on, so it works offline after it loads. We don’t sell your data or use it to train AI. You can export your saved links anytime.",
  },
  {
    q: "Do you train AI on my links?",
    a: "No. Your links, summaries, and chats aren’t used to train AI. Cloudstash processes saved content only when it’s needed for features you use, such as summaries, weekly digests, enriched X saves, or chat.",
  },
  {
    q: "How do summaries work?",
    a: "Cloudstash reads the page and adds a short, searchable summary. Some pages can’t be read or don’t have enough useful text, so your link is still saved even when a summary can’t be created.",
  },
  {
    q: "How do I connect Raycast or Telegram?",
    a: "Sign in to the web app and open Integrations — each integration has a guided setup.",
  },
  {
    q: "Can I export everything?",
    a: "Yes — export all saved links as Markdown or plain links anytime from the account menu.",
  },
  {
    q: "How do I delete my account?",
    a: "From Settings → Account → Delete. You’re signed out right away while Cloudstash safely removes your account data in the background.",
  },
];
