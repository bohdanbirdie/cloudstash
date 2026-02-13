/**
 * Binary snapshot format for serializing/deserializing livestore in-memory DBs to R2.
 *
 * Format: [4 bytes: stateDb length][stateDb bytes][4 bytes: eventlogDb length][eventlogDb bytes]
 */

export function packSnapshot(
  state: Uint8Array,
  eventlog: Uint8Array
): Uint8Array {
  const buf = new Uint8Array(4 + state.byteLength + 4 + eventlog.byteLength);
  const view = new DataView(buf.buffer);

  let offset = 0;
  view.setUint32(offset, state.byteLength, true);
  offset += 4;
  buf.set(state, offset);
  offset += state.byteLength;

  view.setUint32(offset, eventlog.byteLength, true);
  offset += 4;
  buf.set(eventlog, offset);

  return buf;
}

export function unpackSnapshot(data: Uint8Array): {
  state: Uint8Array;
  eventlog: Uint8Array;
} {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  let offset = 0;
  const stateLen = view.getUint32(offset, true);
  offset += 4;
  const state = data.slice(offset, offset + stateLen);
  offset += stateLen;

  const eventlogLen = view.getUint32(offset, true);
  offset += 4;
  const eventlog = data.slice(offset, offset + eventlogLen);

  return { state, eventlog };
}
