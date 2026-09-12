/**
 * Read a request body into memory, giving up the moment it passes `limit`.
 *
 * Content-Length is a claim, not a gate: a chunked body carries none, and a
 * client can declare 80 bytes and keep sending. Counting what actually arrives
 * is the only bound that holds. Returns null once past the limit (cancelling
 * the source, so reading stops there) or if the stream fails. A missing body is
 * an empty one.
 *
 * The same reader apps/sign's relay bounds its submit body with.
 */
export async function readBounded(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<ArrayBuffer | null> {
  if (!body) return new ArrayBuffer(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > limit) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    }
  } catch {
    return null;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer as ArrayBuffer;
}
