import { Profiler, useEffect, useRef, useState } from "react";
import type { ProfilerOnRenderCallback, ReactNode } from "react";

type CommitInfo = {
  id: string;
  phase: "mount" | "update" | "nested-update";
  duration: number;
  at: number;
};

type Listener = (info: CommitInfo) => void;

const listeners = new Set<Listener>();

function reportCommit(info: CommitInfo) {
  for (const l of listeners) l(info);
}

interface PerfProfilerProps {
  id: string;
  children: ReactNode;
}

export function PerfProfiler({ id, children }: PerfProfilerProps) {
  if (!import.meta.env.DEV) return <>{children}</>;
  const onRender: ProfilerOnRenderCallback = (profilerId, phase, duration) => {
    reportCommit({
      id: profilerId,
      phase,
      duration,
      at: performance.now(),
    });
  };
  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  );
}

const COMMIT_HISTORY = 40;
const TASK_HISTORY_MS = 15000;
const SESSION_START = performance.now();

function offsetStr(t: number) {
  return `+${((t - SESSION_START) / 1000).toFixed(1)}s`;
}

export function PerfHUD() {
  const [fps, setFps] = useState(0);
  const [fpsAvg, setFpsAvg] = useState(0);
  const [lt, setLt] = useState({ count: 0, total: 0, longest: 0 });
  const [commit, setCommit] = useState<CommitInfo | null>(null);
  const [commitCount, setCommitCount] = useState(0);
  const [copied, setCopied] = useState(false);

  const fpsHistoryRef = useRef<number[]>([]);
  const tasksRef = useRef<Array<{ startTime: number; duration: number }>>([]);
  const commitsRef = useRef<CommitInfo[]>([]);

  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let last = performance.now();
    const loop = (now: number) => {
      frames++;
      if (now - last >= 1000) {
        const currentFps = Math.round((frames * 1000) / (now - last));
        setFps(currentFps);
        fpsHistoryRef.current.push(currentFps);
        if (fpsHistoryRef.current.length > 10) fpsHistoryRef.current.shift();
        const avg =
          fpsHistoryRef.current.reduce((a, b) => a + b, 0) /
          fpsHistoryRef.current.length;
        setFpsAvg(Math.round(avg));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          tasksRef.current.push({
            startTime: entry.startTime,
            duration: entry.duration,
          });
        }
      });
      observer.observe({ entryTypes: ["longtask"] });
    } catch {
      observer = null;
    }

    const tick = window.setInterval(() => {
      const now = performance.now();
      const cutoff = now - TASK_HISTORY_MS;
      while (
        tasksRef.current.length > 0 &&
        tasksRef.current[0].startTime < cutoff
      ) {
        tasksRef.current.shift();
      }
      const recent = tasksRef.current.filter((t) => t.startTime > now - 5000);
      let total = 0;
      let longest = 0;
      for (const t of recent) {
        total += t.duration;
        if (t.duration > longest) longest = t.duration;
      }
      setLt({
        count: recent.length,
        total: Math.round(total),
        longest: Math.round(longest),
      });
    }, 500);

    const listener: Listener = (info) => {
      commitsRef.current.push(info);
      if (commitsRef.current.length > COMMIT_HISTORY)
        commitsRef.current.shift();
      setCommit(info);
      setCommitCount((n) => n + 1);
    };
    listeners.add(listener);

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      window.clearInterval(tick);
      listeners.delete(listener);
    };
  }, []);

  const buildSnapshot = () => {
    const now = performance.now();
    const lines: string[] = [];
    lines.push(`== Cloudstash perf snapshot (session ${offsetStr(now)}) ==`);
    lines.push(
      `FPS: ${fps} (last 1s) · ${fpsAvg} avg over last ${fpsHistoryRef.current.length}s`
    );
    lines.push(
      `Viewport: ${window.innerWidth}x${window.innerHeight} · DPR ${window.devicePixelRatio}`
    );
    lines.push(`UA: ${navigator.userAgent}`);
    lines.push("");

    const tasks = tasksRef.current
      .slice()
      .toSorted((a, b) => a.startTime - b.startTime);
    const totalMs = tasks.reduce((sum, t) => sum + t.duration, 0);
    lines.push(
      `Long tasks (last ${TASK_HISTORY_MS / 1000}s): ${tasks.length} tasks · ${Math.round(totalMs)}ms total`
    );
    for (const t of tasks) {
      lines.push(`  ${Math.round(t.duration)}ms  at ${offsetStr(t.startTime)}`);
    }
    lines.push("");

    const commits = commitsRef.current.slice();
    lines.push(`Commits (last ${commits.length}):`);
    for (const c of commits) {
      lines.push(
        `  ${c.id.padEnd(12)} ${c.phase.padEnd(13)} ${c.duration.toFixed(1).padStart(6)}ms  at ${offsetStr(c.at)}`
      );
    }

    return lines.join("\n");
  };

  const handleCopy = async () => {
    const text = buildSnapshot();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      console.log(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  const fpsColor =
    fps >= 55
      ? "text-emerald-400"
      : fps >= 30
        ? "text-amber-400"
        : "text-rose-400";
  const ltColor =
    lt.total === 0
      ? "text-emerald-400"
      : lt.total < 300
        ? "text-amber-400"
        : "text-rose-400";

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label="Copy perf snapshot"
      className="fixed right-3 bottom-3 z-[9999] rounded-md bg-black/85 px-3 py-2 text-left font-mono text-[11px] leading-snug text-white tabular-nums shadow-lg select-none cursor-pointer transition-colors hover:bg-black/95"
    >
      <div className={fpsColor}>
        {fps} fps <span className="text-white/50">({fpsAvg} avg)</span>
      </div>
      <div className={ltColor}>
        {lt.count} longtask{lt.count === 1 ? "" : "s"} · {lt.total}ms blocked ·
        max {lt.longest}ms (5s)
      </div>
      <div>
        commit {commit?.id ?? "—"} · {commit?.phase ?? "—"} ·{" "}
        {commit ? Math.round(commit.duration * 10) / 10 : 0}ms · #{commitCount}
      </div>
      <div className="mt-1 text-[10px] text-white/50">
        {copied ? "copied ✓" : "click to copy snapshot"}
      </div>
    </button>
  );
}
