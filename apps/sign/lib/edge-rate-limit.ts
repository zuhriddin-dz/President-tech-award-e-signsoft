/**
 * The edge flood-shedder for the public signing app — an in-memory per-IP
 * sliding window, checked in the relay BEFORE any upstream call, so a flood is
 * dropped here at the edge instead of costing a round-trip (and a DB query) on
 * the API. Ported from tms's audited relay, which had exactly this layer.
 *
 * In-memory = per sign-app instance. That is the correct shape for a
 * flood-shedder (the API's own per-IP limit is the second wall); a shared
 * store would be the upgrade only if an exact global cap ever matters.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 40;

const hits = new Map<string, number[]>();

export function allowRequest(ip: string, now: number = Date.now()): boolean {
  const cutoff = now - WINDOW_MS;
  const recent = (hits.get(ip) ?? []).filter((t) => t > cutoff);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 10_000) {
    for (const [k, v] of hits) {
      if (v.every((t) => t <= cutoff)) hits.delete(k);
    }
  }
  return true;
}
