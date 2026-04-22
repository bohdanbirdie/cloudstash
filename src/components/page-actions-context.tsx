import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { LinkListItem } from "@/livestore/queries/links";

export interface ExportAction {
  links: readonly LinkListItem[];
  title: string;
}

interface PageActionsContextValue {
  exportAction: ExportAction | null;
  setExportAction: (action: ExportAction | null) => void;
}

const PageActionsContext = createContext<PageActionsContextValue | null>(null);

export function PageActionsProvider({ children }: { children: ReactNode }) {
  const [exportAction, setExportAction] = useState<ExportAction | null>(null);
  const value = useMemo(
    () => ({ exportAction, setExportAction }),
    [exportAction]
  );
  return (
    <PageActionsContext.Provider value={value}>
      {children}
    </PageActionsContext.Provider>
  );
}

export function usePageActions() {
  const ctx = useContext(PageActionsContext);
  if (!ctx) {
    throw new Error("usePageActions must be used within PageActionsProvider");
  }
  return ctx;
}
