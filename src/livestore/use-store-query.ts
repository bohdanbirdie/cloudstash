import type { Queryable, Store } from "@livestore/livestore";
import { useQuery } from "@livestore/react";

export const useStoreQuery = <TQueryable extends Queryable<any>>(
  queryable: TQueryable,
  store: Store<any>
): Queryable.Result<TQueryable> => useQuery(queryable, { store });
