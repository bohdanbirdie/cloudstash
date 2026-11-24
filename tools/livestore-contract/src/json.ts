import { Schema } from "effect";

export const JsonObject = Schema.Record(Schema.String, Schema.Unknown);
export type JsonObject = typeof JsonObject.Type;

export const byCodeUnit = (a: string, b: string) =>
  a < b ? -1 : a > b ? 1 : 0;

export const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .toSorted(([a], [b]) => byCodeUnit(a, b))
      .map(([key, child]) => [key, sortKeys(child)])
  );
};

/** JSON with object keys sorted, for comparing values regardless of key order. */
export const canonicalJson = (value: unknown) =>
  JSON.stringify(sortKeys(value));

/** The bytes written for a generated file: sorted keys, two-space indent. */
export const formatJson = (value: unknown) =>
  `${JSON.stringify(sortKeys(value), null, 2)}\n`;
