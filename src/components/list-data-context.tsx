import { createContext, useContext, useMemo, useRef } from "react";
import type { ReactNode } from "react";

import { processingStatusByLink$ } from "@/livestore/queries/links";
import type { Tag } from "@/livestore/queries/tags";
import { tagsByLink$ } from "@/livestore/queries/tags";
import { useAppStore } from "@/livestore/store";

export interface ListData {
  tagsByLink: Map<string, readonly Tag[]>;
  statusByLink: Map<string, string>;
}

const ListDataContext = createContext<ListData>({
  tagsByLink: new Map(),
  statusByLink: new Map(),
});

function useTagsByLink(): Map<string, readonly Tag[]> {
  const store = useAppStore();
  const rows = store.useQuery(tagsByLink$);
  const cacheRef = useRef<Map<string, readonly Tag[]>>(new Map());

  return useMemo(() => {
    const grouped = new Map<string, Tag[]>();
    for (const row of rows) {
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
    }

    const next = new Map<string, readonly Tag[]>();
    for (const [linkId, arr] of grouped) {
      const prev = cacheRef.current.get(linkId);
      if (prev && prev.length === arr.length) {
        let same = true;
        for (let i = 0; i < arr.length; i++) {
          const p = prev[i];
          const n = arr[i];
          if (
            !p ||
            !n ||
            p.id !== n.id ||
            p.name !== n.name ||
            p.sortOrder !== n.sortOrder ||
            p.deletedAt !== n.deletedAt
          ) {
            same = false;
            break;
          }
        }
        if (same) {
          next.set(linkId, prev);
          continue;
        }
      }
      next.set(linkId, arr);
    }
    cacheRef.current = next;
    return next;
  }, [rows]);
}

function useStatusByLink(): Map<string, string> {
  const store = useAppStore();
  const rows = store.useQuery(processingStatusByLink$);

  return useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.linkId, row.status);
    }
    return map;
  }, [rows]);
}

export function ListDataProvider({ children }: { children: ReactNode }) {
  const tagsByLink = useTagsByLink();
  const statusByLink = useStatusByLink();

  const value = useMemo(
    () => ({ tagsByLink, statusByLink }),
    [tagsByLink, statusByLink]
  );

  return (
    <ListDataContext.Provider value={value}>
      {children}
    </ListDataContext.Provider>
  );
}

export function useListData(): ListData {
  return useContext(ListDataContext);
}
