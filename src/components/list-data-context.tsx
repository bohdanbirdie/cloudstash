import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";

import type { Tag, TagByLinkRow } from "@/livestore/queries/tags";
import { pendingTagsByLink$, tagsByLink$ } from "@/livestore/queries/tags";
import { useAppStore, useStoreQuery } from "@/livestore/store";

export interface ListData {
  tagsByLink: Map<string, readonly Tag[]>;
}

const ListDataContext = createContext<ListData>({
  tagsByLink: new Map(),
});

function useTagsByLink(): Map<string, readonly Tag[]> {
  const store = useAppStore();
  const rows = useStoreQuery(store, tagsByLink$);
  const pendingRows = useStoreQuery(store, pendingTagsByLink$);
  return useMemo(() => {
    const grouped = new Map<string, Tag[]>();
    const pushRow = (row: TagByLinkRow) => {
      let arr = grouped.get(row.linkId);
      if (!arr) {
        arr = [];
        grouped.set(row.linkId, arr);
      }
      arr.push({
        id: row.id,
        name: row.name,
        sortOrder: row.sortOrder,
        createdAt: row.createdAt,
        deletedAt: row.deletedAt,
      });
    };
    for (const row of rows) pushRow(row);
    for (const row of pendingRows) pushRow(row);

    return grouped;
  }, [rows, pendingRows]);
}

export function ListDataProvider({ children }: { children: ReactNode }) {
  const tagsByLink = useTagsByLink();

  const value = useMemo(() => ({ tagsByLink }), [tagsByLink]);

  return (
    <ListDataContext.Provider value={value}>
      {children}
    </ListDataContext.Provider>
  );
}

export function useListData(): ListData {
  return useContext(ListDataContext);
}
