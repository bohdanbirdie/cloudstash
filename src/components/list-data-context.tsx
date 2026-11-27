import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { Tag, TagByLinkRow } from "@/livestore/queries/tags";
import { pendingTagsByLink$, tagsByLink$ } from "@/livestore/queries/tags";
import { useAppStore } from "@/livestore/store";

export interface ListData {
  tagsByLink: Map<string, readonly Tag[]>;
}

const ListDataContext = createContext<ListData>({
  tagsByLink: new Map(),
});

function groupTagsByLink(
  rows: readonly TagByLinkRow[],
  pendingRows: readonly TagByLinkRow[],
  prevByLink: Map<string, readonly Tag[]>
): Map<string, readonly Tag[]> {
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

  const next = new Map<string, readonly Tag[]>();
  for (const [linkId, arr] of grouped) {
    const prev = prevByLink.get(linkId);
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
  return next;
}

function useTagsByLink(): Map<string, readonly Tag[]> {
  const store = useAppStore();
  const rows = store.useQuery(tagsByLink$);
  const pendingRows = store.useQuery(pendingTagsByLink$);
  const [grouped, setGrouped] = useState(() => ({
    pendingRows,
    rows,
    tagsByLink: groupTagsByLink(rows, pendingRows, new Map()),
  }));

  if (grouped.rows !== rows || grouped.pendingRows !== pendingRows) {
    const tagsByLink = groupTagsByLink(rows, pendingRows, grouped.tagsByLink);
    setGrouped({ pendingRows, rows, tagsByLink });
    return tagsByLink;
  }
  return grouped.tagsByLink;
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
