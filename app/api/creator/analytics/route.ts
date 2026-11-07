/**
 * GET /api/creator/analytics?creatorId=<uid>
 *
 * Returns 30-day engagement analytics for a creator, powered by PostHog HogQL.
 * Data is shaped for Recharts: array of { date, views, likes }.
 *
 * Authentication: only the creator themselves (or an admin) may query their data.
 * The session cookie is verified server-side before any PostHog query fires.
 *
 * Caching: results cached in Upstash Redis for 10 minutes.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/src/lib/firebaseAdmin";
import { cachedFetch } from "@/src/lib/redis";

const POSTHOG_API_KEY    = process.env.POSTHOG_PERSONAL_API_KEY ?? "";
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID       ?? "";
const POSTHOG_HOST       = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com";

export interface DayStats {
  date:  string; // "YYYY-MM-DD"
  views: number;
  likes: number;
}

export async function GET(req: NextRequest) {
  // ── 1. Verify session ─────────────────────────────────────────────────────
  const sessionCookie = req.cookies.get("__session")?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let requestorUid: string;
  try {
    const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, true);
    requestorUid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  // ── 2. Validate creatorId param ───────────────────────────────────────────
  const creatorId = req.nextUrl.searchParams.get("creatorId");
  if (!creatorId) {
    return NextResponse.json({ error: "creatorId is required" }, { status: 400 });
  }

  // Only the creator can view their own analytics
  if (requestorUid !== creatorId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!POSTHOG_API_KEY || !POSTHOG_PROJECT_ID) {
    return NextResponse.json(
      { error: "PostHog is not configured on this server." },
      { status: 503 }
    );
  }

  // ── 3. Query PostHog with Redis cache ─────────────────────────────────────
  const cacheKey = `analytics:creator:${creatorId}`;
  try {
    const data = await cachedFetch<DayStats[]>(
      cacheKey,
      () => queryPostHog(creatorId),
      600 // 10 min TTL
    );
    return NextResponse.json({ data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "PostHog query failed";
    console.error("[creator/analytics]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── PostHog HogQL query ───────────────────────────────────────────────────────
async function queryPostHog(creatorId: string): Promise<DayStats[]> {
  /**
   * HogQL query:
   *  - Filters to 'post_engaged' events for this creator's posts.
   *  - Splits by event_type = 'view' | 'like'.
   *  - Groups by day over the last 30 days.
   *  - Returns columns: [date, views, likes] — one row per day.
   */
  const hogql = `
    SELECT
      toDate(timestamp)                                                  AS date,
      countIf(properties.event_type = 'view')                           AS views,
      countIf(properties.event_type = 'like')                           AS likes
    FROM events
    WHERE
      event = 'post_engaged'
      AND properties.creator_id = '${creatorId.replace(/'/g, "\\'")}'
      AND timestamp >= now() - INTERVAL 30 DAY
    GROUP BY date
    ORDER BY date ASC
  `.trim();

  const url = `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`;

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${POSTHOG_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      query: { kind: "HogQLQuery", query: hogql },
    }),
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostHog API ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json() as {
    results: Array<[string, number, number]>;
  };

  // Shape for Recharts: [{ date, views, likes }]
  return (json.results ?? []).map(([date, views, likes]) => ({
    date:  date.slice(0, 10), // ensure "YYYY-MM-DD"
    views: Number(views),
    likes: Number(likes),
  }));
}
