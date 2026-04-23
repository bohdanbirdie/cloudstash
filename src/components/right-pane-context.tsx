import { useLocation } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import {
  allLinksProjection,
  completedProjection,
  inboxProjection,
  trashProjection,
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

interface RightPaneContextValue {
  activeLinkId: string | null;
  projection: LinkProjection | null;
  openDetail: (target: DetailTarget) => void;
  closeDetail: () => void;
  toggleDetail: (target: DetailTarget) => void;
  navigate: (linkId: string) => void;
}

const RightPaneContext = createContext<RightPaneContextValue | null>(null);

const EMPTY: RightPaneState = { activeLinkId: null, projection: null };

const ROUTE_PROJECTIONS: Record<string, LinkProjection> = {
  "/": inboxProjection,
  "/all": allLinksProjection,
  "/completed": completedProjection,
  "/trash": trashProjection,
};

function projectionForPath(pathname: string): LinkProjection | null {
  return ROUTE_PROJECTIONS[pathname] ?? null;
}

export function RightPaneProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RightPaneState>(EMPTY);
  const { pathname } = useLocation();
  const lastPathnameRef = useRef(pathname);
  const stateRef = useRef(state);
  stateRef.current = state;

  // If pathname changed since last render, the route-change effect hasn't
  // committed the reset yet. Present EMPTY to consumers so stale state from
  // the previous route doesn't flash (e.g. wrong active row).
  const stale = lastPathnameRef.current !== pathname;
  const current = stale ? EMPTY : state;

  useEffect(() => {
    lastPathnameRef.current = pathname;
    setState(EMPTY);
  }, [pathname]);

  const openDetail = useCallback(
    ({ linkId, projection }: DetailTarget) => {
      setState({
        activeLinkId: linkId,
        projection: projection ?? projectionForPath(pathname),
      });
    },
    [pathname]
  );

  const closeDetail = useCallback(() => {
    const prevId = stateRef.current.activeLinkId;
    setState(EMPTY);
    if (prevId) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-id="${prevId}"]`)?.focus();
      });
    }
  }, []);

  const toggleDetail = useCallback(
    ({ linkId, projection }: DetailTarget) => {
      setState((prev) =>
        prev.activeLinkId === linkId
          ? EMPTY
          : {
              activeLinkId: linkId,
              projection: projection ?? projectionForPath(pathname),
            }
      );
    },
    [pathname]
  );

  const navigate = useCallback((linkId: string) => {
    setState((prev) =>
      prev.activeLinkId ? { ...prev, activeLinkId: linkId } : prev
    );
  }, []);

  const value = useMemo(
    () => ({
      activeLinkId: current.activeLinkId,
      projection: current.projection,
      openDetail,
      closeDetail,
      toggleDetail,
      navigate,
    }),
    [
      current.activeLinkId,
      current.projection,
      openDetail,
      closeDetail,
      toggleDetail,
      navigate,
    ]
  );

  return (
    <RightPaneContext.Provider value={value}>
      {children}
    </RightPaneContext.Provider>
  );
}

export function useRightPane() {
  const ctx = useContext(RightPaneContext);
  if (!ctx) {
    throw new Error("useRightPane must be used within RightPaneProvider");
  }
  return ctx;
}
