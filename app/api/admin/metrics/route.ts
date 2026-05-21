// GET /api/admin/metrics — aggregate the RUM event store into the
// shape the admin dashboard renders. Admin-only (403 otherwise).
//
// The aggregation function itself lives in `lib/metrics-aggregate.ts`
// because Next.js's Route Handler typecheck only allows reserved
// exports (GET, POST, dynamic, …) from a `route.ts` file. Keeping
// the helper here would mean it can't be unit-tested by name.
// Splitting also lets the dashboard panel import the response type
// from a non-route module without dragging the Blobs runtime.
//
// Read strategy: list `events/<YYYY-MM-DD>/*` for each day in the
// requested window, fan-out the per-event reads. At our volume
// (a few hundred events/day) we re-aggregate on every request —
// the response gets a 15s `cache-control` so dashboard tab
// refreshes don't hammer Blobs.

import { metricsStore } from "@/lib/blobs";
import { requireAdmin } from "@/lib/server/session";
import { aggregate, type StoredEvent } from "@/lib/metrics-aggregate";

const MAX_DAYS = 90;
const DEFAULT_DAYS = 30;

/** Build the list of YYYY-MM-DD strings we want to read, ending
 *  today (UTC). Cheap because N ≤ 90. */
function daysWindow(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Read every event blob under a single day's prefix. Returns
 *  parsed events; skips any blob that fails to parse (corruption
 *  / partial write). */
async function readDayEvents(
  store: ReturnType<typeof metricsStore>,
  day: string,
): Promise<StoredEvent[]> {
  const events: StoredEvent[] = [];
  // `paginate: true` returns an AsyncIterable that the runtime
  // walks page-by-page — the SDK handles cursors internally. We
  // accumulate keys first, then fan-out the reads so latency is
  // bounded by the slowest single read, not the sum.
  const keys: string[] = [];
  for await (const page of store.list({ prefix: `events/${day}/`, paginate: true })) {
    for (const b of page.blobs) keys.push(b.key);
  }
  const parsed = await Promise.all(
    keys.map(async (key) => {
      try {
        const v = (await store.get(key, { type: "json" })) as StoredEvent | null;
        return v;
      } catch {
        return null;
      }
    }),
  );
  for (const ev of parsed) if (ev) events.push(ev);
  return events;
}

export async function GET(request: Request): Promise<Response> {
  const session = await requireAdmin();
  if (!session) {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }

  const url = new URL(request.url);
  const daysParam = Number(url.searchParams.get("days") ?? DEFAULT_DAYS);
  const days = Math.max(
    1,
    Math.min(MAX_DAYS, Number.isFinite(daysParam) ? daysParam : DEFAULT_DAYS),
  );

  const store = metricsStore();
  const window = daysWindow(days);
  // Fan-out across days so a 30-day window doesn't serialise 30
  // round-trips. The list-then-fan-out-the-reads pattern inside
  // `readDayEvents` is the inner-loop concurrency; this is the
  // outer.
  const events: StoredEvent[] = [];
  const results = await Promise.all(window.map((day) => readDayEvents(store, day)));
  for (const list of results) events.push(...list);

  const response = aggregate(events, days);
  // Short cache to absorb dashboard-tab refreshes without
  // re-aggregating each time, but short enough that a new event
  // is visible within seconds.
  return Response.json(response, {
    headers: { "cache-control": "private, max-age=15" },
  });
}
