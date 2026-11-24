declare const State: {
  SQLite: {
    materializers: (
      events: unknown,
      handlers: Record<string, (args: { at: string }) => unknown>
    ) => unknown;
  };
};
declare const defineMaterializer: (
  event: unknown,
  handler: (args: { at: string }) => unknown
) => unknown;
declare const nanoid: () => string;
declare const events: unknown;
declare const event: unknown;

// Allowed: outside a materializer, the current time and random ids are fine.
export const committedAt = Date.now();
export const commandId = crypto.randomUUID();

export const materializers = State.SQLite.materializers(events, {
  // Violations: Date.now, new Date(), Math.random, crypto.randomUUID.
  "v1.Clock": () => ({ at: Date.now(), date: new Date() }),
  "v1.Random": () => ({ id: crypto.randomUUID(), roll: Math.random() }),
  // Violations: globalThis.crypto.randomUUID, nanoid(), Date().
  "v1.Ids": () => ({
    id: globalThis.crypto.randomUUID(),
    short: nanoid(),
    text: Date(),
  }),
  // Allowed: dates built from the payload and pure Math helpers.
  "v1.Pure": ({ at }) => ({ at: new Date(at), max: Math.max(1, 2) }),
});

// Violation: Date.now inside defineMaterializer.
export const single = defineMaterializer(event, () => ({ at: Date.now() }));
