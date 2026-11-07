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
import type { CreatorAnalytics, EngagementStats } from "@/src/types/analytics";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/src/lib/firebaseAdmin";
import { cachedFetch } from "@/src/lib/redis";

const POSTHOG_API_KEY    = process.env.POSTHOG_PERSONAL_API_KEY ?? "";
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID       ?? "";
const POSTHOG_HOST       = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com";

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
  const cacheKey = `analytics:creator:v2:${creatorId}`;
  try {
    const data = await cachedFetch<CreatorAnalytics>(
      cacheKey,
      () => queryPostHog(creatorId),
      60 // One-minute cache for new engagement data
    );
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "PostHog query failed";
    console.error("[creator/analytics]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── PostHog HogQL query ───────────────────────────────────────────────────────
const aggregates = `
  countIf(properties.event_type = 'view'),
  countIf(properties.event_type = 'impression'),
  sumIf(toFloat(properties.like_delta), properties.event_type IN ('like', 'unlike')),
  uniqExactIf(properties.viewer_id, properties.event_type = 'view'),
  sumIf(toFloat(properties.watch_seconds), properties.event_type = 'watch_time'),
  uniqExactIf(properties.viewer_id, properties.event_type = 'watch_time' AND toFloat(properties.watch_seconds) > 0)
`;

function shapeStats(row: unknown[]): EngagementStats {
  const number = (index: number) => { const value = Number(row[index]); return Number.isFinite(value) ? value : 0; };
  const watchSeconds = number(4);
  const watchViewers = number(5);
  return { views: number(0), impressions: number(1), likes: number(2), uniqueViewers: number(3), watchSeconds, watchViewers, avgWatchSeconds: watchViewers ? watchSeconds / watchViewers : 0 };
}

async function queryPostHog(creatorId: string): Promise<CreatorAnalytics> {
  const escaped = creatorId.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const from = `FROM events
    WHERE event = 'post_engaged' AND properties.schema_version = 2
      AND properties.creator_id = '${escaped}'
      AND properties.viewer_id != properties.creator_id
      AND timestamp >= now() - INTERVAL 30 DAY`;
  const [daily, total] = await Promise.all([
    runQuery(`SELECT toDate(timestamp), ${aggregates} ${from} GROUP BY toDate(timestamp) ORDER BY toDate(timestamp) ASC`),
    runQuery(`SELECT ${aggregates} ${from}`),
  ]);
  return {
    data: daily.map((row) => ({ date: String(row[0]).slice(0, 10), ...shapeStats(row.slice(1)) })),
    summary: shapeStats(total[0] ?? []),
  };
}

async function runQuery(query: string): Promise<unknown[][]> {
  // Ingestion hosts and query API hosts differ on PostHog Cloud.
  const host = POSTHOG_HOST.replace("us.i.posthog.com", "us.posthog.com").replace("eu.i.posthog.com", "eu.posthog.com").replace(/\/$/, "");
  const res = await fetch(`${host}/api/projects/${POSTHOG_PROJECT_ID}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${POSTHOG_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`PostHog query failed (HTTP ${res.status}).`);
  const json = await res.json() as { results?: unknown[][] };
  return json.results ?? [];
}
