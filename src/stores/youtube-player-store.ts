import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type FloatingSize = "m" | "l" | "xl";

const VALID_SIZES: ReadonlySet<string> = new Set<string>(["m", "l", "xl"]);

function isFloatingSize(value: unknown): value is FloatingSize {
  return typeof value === "string" && VALID_SIZES.has(value);
}

function sanitizePosFraction(
  value: unknown
): { fx: number; fy: number } | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as { fx?: unknown; fy?: unknown };
  if (
    typeof v.fx !== "number" ||
    typeof v.fy !== "number" ||
    !Number.isFinite(v.fx) ||
    !Number.isFinite(v.fy)
  ) {
    return null;
  }
  return { fx: v.fx, fy: v.fy };
}

interface YouTubePlayerState {
  videoId: string | null;
  sourceLinkId: string | null;
  startSeconds: number | undefined;
  anchorRect: Rect | null;
  floatingSize: FloatingSize;
  floatingPosFraction: { fx: number; fy: number } | null;
  setVideo: (args: {
    videoId: string;
    sourceLinkId: string;
    startSeconds?: number;
    anchorRect?: Rect | null;
  }) => void;
  clear: () => void;
  setAnchorRect: (rect: Rect | null) => void;
  setFloatingPosFraction: (pos: { fx: number; fy: number }) => void;
  setFloatingSize: (size: FloatingSize) => void;
}

export const useYouTubePlayerStore = create<YouTubePlayerState>()(
  persist(
    (set) => ({
      videoId: null,
      sourceLinkId: null,
      startSeconds: undefined,
      anchorRect: null,
      floatingSize: "l",
      floatingPosFraction: null,
      setVideo: ({ videoId, sourceLinkId, startSeconds, anchorRect = null }) =>
        set({ videoId, sourceLinkId, startSeconds, anchorRect }),
      clear: () =>
        set({
          videoId: null,
          sourceLinkId: null,
          startSeconds: undefined,
          anchorRect: null,
        }),
      setAnchorRect: (anchorRect) => set({ anchorRect }),
      setFloatingPosFraction: (floatingPosFraction) =>
        set({ floatingPosFraction }),
      setFloatingSize: (floatingSize) => set({ floatingSize }),
    }),
    {
      name: "cloudstash:youtube-player",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        floatingSize: state.floatingSize,
        floatingPosFraction: state.floatingPosFraction,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<YouTubePlayerState>;
        return {
          ...current,
          floatingSize: isFloatingSize(p.floatingSize)
            ? p.floatingSize
            : current.floatingSize,
          floatingPosFraction: sanitizePosFraction(p.floatingPosFraction),
        };
      },
    }
  )
);
