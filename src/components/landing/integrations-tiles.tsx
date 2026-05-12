import { motion } from "motion/react";
import { Fragment } from "react";

import { CloudstashLogo } from "@/components/cloudstash-logo";
import { Kbd } from "@/components/ui/kbd";
import { KeyChord } from "@/components/ui/key-chord";

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

type SummaryToken = string | { word: string; primary: true };

const TELEGRAM_SUMMARY: readonly SummaryToken[] = [
  "Saved.",
  "A",
  "video",
  "essay",
  "on",
  "urban",
  "noise",
  "—",
  "vehicle",
  "design,",
  "building",
  "height,",
  "and",
  "the",
  "disappearing",
  { word: "soundscape.", primary: true },
];

const TELEGRAM_STREAM_START = 1.1;
const TELEGRAM_WORD_STAGGER = 0.06;

const MOCKUP_STAGGER = 0.22;

export function IntegrationsTiles() {
  return (
    <ul className="grid gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <IntegrationTile
        name="Telegram"
        caption="Forward a link to the bot — a summary streams back."
      >
        <TelegramMockup delay={0} />
      </IntegrationTile>
      <IntegrationTile
        name="Raycast"
        caption={
          <>
            Save the front tab with{" "}
            <Kbd>
              <KeyChord keys={["cmd", "shift", "S"]} />
            </Kbd>
            .
          </>
        }
      >
        <RaycastMockup delay={MOCKUP_STAGGER} />
      </IntegrationTile>
      <IntegrationTile
        name="iOS Share Sheet"
        caption="Share from Safari, Twitter, anything."
      >
        <IosMockup delay={2 * MOCKUP_STAGGER} />
      </IntegrationTile>
      <IntegrationTile
        name="X bookmarks"
        caption="Bookmark on X. It lands here, summarized."
      >
        <XBookmarksMockup delay={3 * MOCKUP_STAGGER} />
      </IntegrationTile>
      <IntegrationTile
        name="Chrome extension"
        caption={
          <>
            Save the active tab in one click —{" "}
            <Kbd>
              <KeyChord keys={["alt", "cmd", "S"]} />
            </Kbd>{" "}
            from anywhere.
          </>
        }
      >
        <ChromeMockup delay={4 * MOCKUP_STAGGER} />
      </IntegrationTile>
      <IntegrationTile
        name="MCP server"
        caption="Your AI assistant can search and read your archive."
      >
        <McpMockup delay={5 * MOCKUP_STAGGER} />
      </IntegrationTile>
    </ul>
  );
}

function IntegrationTile({
  children,
  name,
  caption,
}: {
  children: React.ReactNode;
  name: string;
  caption: React.ReactNode;
}) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      className="flex flex-col overflow-hidden rounded-md border border-border/80 bg-background transition-[border-color,box-shadow] hover:border-border hover:shadow-[0_1px_0_oklch(0_0_0_/_0.04),0_8px_20px_-16px_oklch(0_0_0_/_0.18)]"
    >
      <div className="grid min-h-[180px] flex-1 select-none place-items-center px-5 py-7">
        {children}
      </div>
      <div className="min-h-[6rem] border-t border-border/60 px-5 py-3.5">
        <div className="text-[13px] font-semibold tracking-tight">{name}</div>
        <p className="mt-0.5 text-pretty text-[13px] leading-relaxed text-muted-foreground">
          {caption}
        </p>
      </div>
    </motion.li>
  );
}

function TelegramMockup({ delay = 0 }: { delay?: number }) {
  return (
    <div className="w-full max-w-[300px]">
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.96 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.4, ease: EASE_OUT, delay: delay + 0.3 }}
        className="ml-auto max-w-[240px] rounded-2xl rounded-br-[6px] bg-[#229ED9] px-3 pb-1.5 pt-2 text-white shadow-sm"
      >
        <div className="border-l-2 border-white/70 pl-2">
          <div className="text-[11px] font-medium opacity-90">youtube.com</div>
          <div className="mt-0.5 truncate text-[12.5px] font-medium leading-snug">
            Why Cities Are So Loud
          </div>
        </div>
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-80">
          <span className="tabular-nums">14:23</span>
          <svg
            viewBox="0 0 24 24"
            className="size-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 12l4 4 8-8" />
            <path d="M9 16l8-8" />
          </svg>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.35, ease: EASE_OUT, delay: delay + 0.7 }}
        className="mt-3 flex items-start gap-1.5"
      >
        <span className="grid size-6 shrink-0 overflow-hidden rounded-full">
          <CloudstashLogo className="size-full" variant="branded" />
        </span>
        <div className="max-w-[220px] rounded-2xl rounded-tl-md bg-muted px-3 py-2 text-[12px] leading-snug text-foreground">
          {TELEGRAM_SUMMARY.map((tok, i) => {
            const isObj = typeof tok === "object";
            const word = isObj ? tok.word : tok;
            const isPrimary = isObj && tok.primary;
            return (
              <Fragment key={i}>
                {i > 0 && " "}
                <motion.span
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{
                    duration: 0.16,
                    ease: EASE_OUT,
                    delay:
                      delay + TELEGRAM_STREAM_START + i * TELEGRAM_WORD_STAGGER,
                  }}
                  className={isPrimary ? "font-medium text-primary" : undefined}
                >
                  {word}
                </motion.span>
              </Fragment>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

function RaycastMockup({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, ease: EASE_OUT, delay: delay + 0.3 }}
      className="w-full max-w-[320px] overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 text-white shadow-md"
    >
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2 text-[12px]">
        <RaycastMark className="size-3.5" />
        <span className="flex-1 truncate text-white/55">Save current tab</span>
      </div>
      <ul className="px-1.5 py-1.5">
        <motion.li
          initial={{ backgroundColor: "rgba(255,255,255,0)" }}
          whileInView={{
            backgroundColor: [
              "rgba(255,255,255,0)",
              "rgba(255,99,99,0.18)",
              "rgba(255,255,255,0.05)",
            ],
          }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 1.0, ease: EASE_OUT, delay: delay + 0.7 }}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px]"
        >
          <CloudstashLogo className="size-4 rounded-sm" variant="branded" />
          <span className="flex-1 truncate">Save current tab</span>
          <span className="flex items-center gap-0.5 font-mono text-[10px] text-white/55">
            <kbd className="rounded-[3px] border border-white/15 bg-white/10 px-1 py-0.5">
              <KeyChord keys={["cmd"]} />
            </kbd>
            <kbd className="rounded-[3px] border border-white/15 bg-white/10 px-1 py-0.5">
              <KeyChord keys={["shift"]} />
            </kbd>
            <kbd className="rounded-[3px] border border-white/15 bg-white/10 px-1 py-0.5">
              S
            </kbd>
          </span>
        </motion.li>
        <li className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] opacity-50">
          <span className="size-4 rounded-sm bg-white/10" />
          <span className="flex-1 truncate text-white/70">
            Search your archive
          </span>
        </li>
      </ul>
    </motion.div>
  );
}

function RaycastMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1.5" y="1.5" width="21" height="21" rx="5.5" fill="#FF6363" />
      <path
        d="M 7.5 10 L 12 14.5 L 16.5 10"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function IosMockup({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, ease: EASE_OUT, delay: delay + 0.3 }}
      className="mx-auto w-full max-w-[280px] overflow-hidden rounded-t-2xl border border-b-0 border-border/60 bg-background px-4 pb-5 pt-2.5 shadow-[0_-6px_20px_-12px_rgba(0,0,0,0.18)]"
    >
      <span className="mx-auto mb-3 block h-1 w-9 rounded-full bg-muted-foreground/30" />
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Share to
      </div>
      <ul className="mt-2.5 flex items-start justify-between gap-2">
        <IosAppIcon color="#FFCC00" name="Notes" />
        <IosAppIcon color="#5856D6" name="Mail" />
        <motion.li
          initial={{ scale: 0.85, opacity: 0.6 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4, ease: EASE_OUT, delay: delay + 0.75 }}
          className="flex w-12 flex-col items-center gap-1.5"
        >
          <span className="size-10 overflow-hidden rounded-[22%] [corner-shape:squircle]">
            <CloudstashLogo
              className="size-full scale-[1.154]"
              variant="branded"
            />
          </span>
          <span className="truncate text-[9px] font-medium text-foreground">
            Cloudstash
          </span>
        </motion.li>
        <IosAppIcon color="#34C759" name="Messages" />
        <IosAppIcon color="#8E8E93" name="More" />
      </ul>
    </motion.div>
  );
}

function IosAppIcon({ color, name }: { color: string; name: string }) {
  return (
    <li className="flex w-12 flex-col items-center gap-1.5 opacity-45">
      <span
        className="size-10 rounded-[22%] [corner-shape:squircle]"
        style={{ backgroundColor: color }}
      />
      <span className="truncate text-[9px] text-muted-foreground">{name}</span>
    </li>
  );
}

function XBookmarksMockup({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, ease: EASE_OUT, delay: delay + 0.3 }}
      className="w-full max-w-[290px] overflow-hidden rounded-md border border-zinc-800 bg-black text-white shadow-md"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2">
        <div className="flex items-center gap-1.5">
          <XMark className="size-3" />
          <span className="text-[11px] font-medium">Bookmarks</span>
        </div>
        <span className="text-[10px] tabular-nums text-white/45">12 new</span>
      </div>
      <div className="flex items-start gap-2.5 px-3.5 py-3">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full text-[10.5px] font-semibold"
          style={{
            background: "linear-gradient(135deg, #4b4f56 0%, #1c1f24 100%)",
          }}
        >
          AK
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1 text-[11.5px]">
            <span className="truncate font-semibold">Alex Kelly</span>
            <span className="truncate text-white/45">@alexk · 2h</span>
          </div>
          <p className="mt-0.5 text-[12.5px] leading-snug">
            The clearest piece I&apos;ve read on focus and attention.
          </p>
          <div className="mt-2.5 flex items-center gap-4 text-zinc-400">
            <CommentIcon className="size-3.5" />
            <RepostIcon className="size-3.5" />
            <HeartIcon className="size-3.5" />
            <motion.span
              initial={{ scale: 0.85 }}
              whileInView={{ scale: [0.85, 1.25, 1] }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{
                duration: 0.5,
                ease: EASE_OUT,
                delay: delay + 0.85,
                times: [0, 0.5, 1],
              }}
              style={{ color: "#1d9bf0" }}
            >
              <BookmarkFilledIcon className="size-3.5" />
            </motion.span>
          </div>
        </div>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.35, ease: EASE_OUT, delay: delay + 1.15 }}
        className="flex items-center gap-1.5 border-t border-white/10 bg-white/[0.04] px-3.5 py-2 text-[10.5px] text-white/75"
      >
        <CloudstashLogo className="size-3 rounded-[2px]" variant="branded" />
        <span>Saved to Cloudstash</span>
      </motion.div>
    </motion.div>
  );
}

function XMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function CommentIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
    </svg>
  );
}

function RepostIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function BookmarkFilledIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ChromeMockup({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, ease: EASE_OUT, delay: delay + 0.3 }}
      className="w-full max-w-[260px] overflow-hidden rounded-md border border-border/80 bg-background shadow-md"
    >
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <CloudstashLogo
            className="size-3.5 rounded-[3px]"
            variant="branded"
          />
          <span className="text-[11px] font-semibold tracking-tight">
            Cloudstash
          </span>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          <KeyChord keys={["alt", "cmd", "S"]} />
        </span>
      </div>
      <div className="px-3.5 py-3">
        <div className="text-[11.5px] font-medium leading-snug">
          Save this tab
        </div>
        <div className="mt-1 truncate text-[10px] text-muted-foreground">
          nytimes.com/style/high-line-dawn
        </div>
        <motion.div
          initial={{ scale: 0.94, opacity: 0.6 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4, ease: EASE_OUT, delay: delay + 0.85 }}
          className="mt-3 flex items-center justify-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground"
        >
          <svg
            className="size-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Saved
        </motion.div>
      </div>
    </motion.div>
  );
}

function McpMockup({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, ease: EASE_OUT, delay: delay + 0.3 }}
      className="w-full max-w-xs overflow-hidden rounded-md border border-border/80 bg-background shadow-sm"
    >
      <div className="flex min-w-0 flex-col gap-2 p-3.5">
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.35, ease: EASE_OUT, delay: delay + 0.5 }}
          className="ml-auto max-w-[82%] rounded-2xl rounded-br-md bg-muted px-3 py-1.5 text-xs leading-snug"
        >
          What did I save about gardens?
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.35, ease: EASE_OUT, delay: delay + 0.9 }}
          className="min-w-0 max-w-[94%] rounded-2xl rounded-bl-md border border-border/60 bg-background px-3 py-2 text-xs leading-snug"
        >
          <p className="text-foreground/90">One piece from your archive:</p>
          <div className="mt-1.5 flex items-start gap-1.5">
            <span
              className="mt-0.5 grid size-3 shrink-0 place-items-center rounded-sm font-serif text-[0.5rem] font-bold text-white"
              style={{ backgroundColor: "#000" }}
              aria-hidden="true"
            >
              T
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">
                A walk through the New York Botanical Garden
              </div>
              <div className="text-[0.65rem] text-muted-foreground/70">
                nytimes.com
              </div>
            </div>
          </div>
        </motion.div>
      </div>
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.35, ease: EASE_OUT, delay: delay + 1.25 }}
        className="flex items-center gap-1.5 border-t border-border/60 bg-muted/30 px-3.5 py-2 text-[0.65rem] text-muted-foreground"
      >
        <CloudstashLogo className="size-3 rounded-sm" variant="branded" />
        <span>
          via Cloudstash{" "}
          <span className="font-mono text-foreground/70">MCP</span>
        </span>
      </motion.div>
    </motion.div>
  );
}
