import { drizzle } from "drizzle-orm/d1";

import { relations } from "./relations";

export const createDb = (d1: D1Database) => drizzle(d1, { relations });

export type Database = ReturnType<typeof createDb>;
