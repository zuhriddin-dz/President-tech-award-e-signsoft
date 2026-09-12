import { describe, expect, it } from 'vitest';
import { readBounded } from './read-bounded';

/**
 * /api/verify is public and its honest body is ~80 bytes, but next.config.ts
 * lets bodies up to 21MiB through middleware so PDF uploads arrive whole. This
 * reader is what keeps that allowance from reaching the verify route: these pin
 * that it counts real bytes, stops at the limit, and never hands back a partial
 * body as if it were the whole one.
 */

/** A pull-based stream over `chunks`, recording how far it was read. */
function streamOf(chunks: Uint8Array[]) {
  const state = { pulled: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (state.pulled < chunks.length) controller.enqueue(chunks[state.pulled++]!);
      else controller.close();
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { stream, state };
}

const bytes = (n: number, fill = 0x61) => new Uint8Array(n).fill(fill);

describe('readBounded', () => {
  it('returns every byte of a body within the limit, across chunks', async () => {
    const { stream } = streamOf([Uint8Array.from([1, 2, 3]), Uint8Array.from([4, 5, 6, 7])]);
    const out = await readBounded(stream, 10);
    expect(out).not.toBeNull();
    expect([...new Uint8Array(out!)]).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('accepts a body of exactly the limit', async () => {
    const { stream } = streamOf([bytes(1000), bytes(24)]);
    const out = await readBounded(stream, 1024);
    expect(out?.byteLength).toBe(1024);
  });

  it('returns null one byte past the limit — never a truncated body', async () => {
    const { stream } = streamOf([bytes(1000), bytes(25)]);
    expect(await readBounded(stream, 1024)).toBeNull();
  });

  it('stops reading the source once the limit is passed', async () => {
    // 50 × 100 bytes against a 1KiB limit: the 11th chunk crosses it.
    const { stream, state } = streamOf(Array.from({ length: 50 }, () => bytes(100)));
    expect(await readBounded(stream, 1024)).toBeNull();
    expect(state.cancelled).toBe(true);
    expect(state.pulled).toBeLessThan(50);
  });

  it('treats a missing body as empty', async () => {
    const out = await readBounded(null, 1024);
    expect(out?.byteLength).toBe(0);
  });

  it('returns null when the stream fails mid-read', async () => {
    let sent = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) {
          sent = true;
          controller.enqueue(bytes(10));
        } else {
          controller.error(new Error('client went away'));
        }
      },
    });
    expect(await readBounded(stream, 1024)).toBeNull();
  });
});
