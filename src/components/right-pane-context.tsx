import { useLocation } from "@tanstack/react-router";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import {
  allLinksProjection,
  archiveProjection,
  completedProjection,
  inboxProjection,
} from "@/lib/link-projections";
import type { LinkProjection } from "@/lib/link-projections";

interface RightPaneState {
  activeLinkId: string | null;
  projection: LinkProjection | null;
}

interface DetailTarget {
  linkId: string;
  projection?: LinkProjection;
}

interface RightPaneActions {
  openDetail: (target: DetailTarget) => void;
  closeDetail: () => void;
  toggleDetail: (target: DetailTarget) => void;
  navigate: (linkId: string) => void;
}

const RightPaneStateContext = createContext<RightPaneState | null>(null);
const RightPaneActionsContext = createContext<RightPaneActions | null>(null);

const EMPTY: RightPaneState = { activeLinkId: null, projection: null };

const ROUTE_PROJECTIONS: Record<string, LinkProjection> = {
  "/": inboxProjection,
  "/all": allLinksProjection,
  "/completed": completedProjection,
  "/archive": archiveProjection,
};

function projectionForPath(pathname: string): LinkProjection | null {
  return ROUTE_PROJECTIONS[pathname] ?? null;
}

export function RightPaneProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RightPaneState>(EMPTY);
  const { pathname } = useLocation();
  const lastPathnameRef = useRef(pathname);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // If pathname changed since last render, the route-change effect hasn't
  // committed the reset yet. Present EMPTY to consumers so stale state from
  // the previous route doesn't flash (e.g. wrong active row).
  const stale = lastPathnameRef.current !== pathname;
  const current = stale ? EMPTY : state;

  useEffect(() => {
    lastPathnameRef.current = pathname;
    setState(EMPTY);
  }, [pathname]);

  // Stable actions across route changes: read pathname via ref so the
  // callback identity doesn't change. Actions consumers (CommandChip,
  // AddLinkDialog, link-mention, DetailView) won't re-render on activeLinkId
  // changes or route changes.
  const actions = useMemo<RightPaneActions>(
    () => ({
      openDetail: ({ linkId, projection }) => {
        setState({
          activeLinkId: linkId,
          projection: projection ?? projectionForPath(pathnameRef.current),
        });
      },
      closeDetail: () => {
        setState(EMPTY);
      },
      toggleDetail: ({ linkId, projection }) => {
        setState((prev) =>
          prev.activeLinkId === linkId
            ? EMPTY
            : {
                activeLinkId: linkId,
                projection:
                  projection ?? projectionForPath(pathnameRef.current),
              }
        );
      },
      navigate: (linkId) => {
        setState((prev) =>
          prev.activeLinkId ? { ...prev, activeLinkId: linkId } : prev
        );
      },
    }),
    []
  );

  return (
    <RightPaneActionsContext.Provider value={actions}>
      <RightPaneStateContext.Provider value={current}>
        {children}
      </RightPaneStateContext.Provider>
    </RightPaneActionsContext.Provider>
  );
}

export function useRightPaneState(): RightPaneState {
  const ctx = useContext(RightPaneStateContext);
  if (!ctx) {
    throw new Error("useRightPaneState must be used within RightPaneProvider");
  }
  return ctx;
}

export function useRightPaneActions(): RightPaneActions {
  const ctx = useContext(RightPaneActionsContext);
  if (!ctx) {
    throw new Error(
      "useRightPaneActions must be used within RightPaneProvider"
    );
  }
  return ctx;
}
