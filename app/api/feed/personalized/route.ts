/**
 * GET /api/feed/personalized?uid=<uid>&page=<n>
 *
 * Returns a personalized post feed using Algolia Recommend.
 * Falls back to Firestore (newest-first) if Recommend returns nothing.
 *
 * Caching:
 *  - Personalized results cached in Upstash Redis for 5 minutes per user page.
 *  - Fallback results cached for 3 minutes.
 */
import { recommendClient } from "@algolia/recommend";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/src/lib/firebaseAdmin";
import { FirebaseAdminConfigurationError, getAdminDb } from "@/src/lib/firebaseAdmin";
import { cachedFetch } from "@/src/lib/redis";

const ALGOLIA_APP_ID   = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID  ?? "";
const ALGOLIA_ADMIN_KEY = process.env.ALGOLIA_ADMIN_KEY           ?? "";
const ALGOLIA_INDEX    = process.env.ALGOLIA_INDEX_NAME           ?? "noorfeed_posts";
const PAGE_SIZE        = 12;
let recommendRetryAt = 0;

export async function GET(req: NextRequest) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      loadFeed(req),
      new Promise<NextResponse>((resolve) => {
        timer = setTimeout(() => resolve(NextResponse.json(
          { clientFallback: true, source: "firestore" },
          { headers: { "Cache-Control": "no-store" } },
        )), 4500);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadFeed(req: NextRequest) {
  try {
    getAdminDb(); // Check configuration before attempting cache/network requests.
    // ── 1. Authenticate ───────────────────────────────────────────────────────
    const sessionCookie = req.cookies.get("__session")?.value;
    let uid: string | null = null;
  
    if (sessionCookie) {
      try {
        const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, true);
        uid = decoded.uid;
      } catch { /* treat as guest */ }
    }
  
    const page = parseInt(req.nextUrl.searchParams.get("page") ?? "0", 10);
  
    // ── 2. Try Algolia Recommend (authenticated users only) ───────────────────
    if (page === 0 && uid && ALGOLIA_APP_ID && ALGOLIA_ADMIN_KEY && Date.now() >= recommendRetryAt) {
      const cacheKey = `feed:recommend:${uid}:${page}`;
      try {
        const result = await cachedFetch(
          cacheKey,
          () => fetchAlgoliaRecommend(),
          300 // 5 min TTL
        );
        if (result && (result as unknown[]).length > 0) {
          return NextResponse.json({ posts: result, source: "algolia" });
        }
      } catch (err) {
        recommendRetryAt = Date.now() + 5 * 60_000;
        console.warn("[personalized] Algolia Recommend unavailable; using Firestore", { name: err instanceof Error ? err.name : "UnknownError" });
      }
    }
  
    // ── 3. Firestore fallback with Redis caching ──────────────────────────────
    const cacheKey = `feed:recent:v2:${page}`;
    const result = await cachedFetch(
      cacheKey,
      () => fetchFirestoreFeed(page),
      180 // 3 min TTL for public feed
    );
  
    return NextResponse.json({ ...result, source: "firestore" });
  } catch (error) {
    if (error instanceof FirebaseAdminConfigurationError) {
      return NextResponse.json({ clientFallback: true, source: "firestore" }, { headers: { "Cache-Control": "no-store" } });
    }
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unknown";
    console.warn("[personalized] Server feed unavailable; using browser Firestore", { code });
    return NextResponse.json({ clientFallback: true, source: "firestore" }, { headers: { "Cache-Control": "no-store" } });
  }
}

// ── Algolia Recommend fetcher ─────────────────────────────────────────────────
async function fetchAlgoliaRecommend() {
  const client = recommendClient(ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY, {
    timeouts: { connect: 1000, read: 2000, write: 2000 },
  });
  const data = await client.getRecommendations({
    requests: [{
      indexName: ALGOLIA_INDEX,
      model: "trending-items",
      threshold: 0,
      maxRecommendations: PAGE_SIZE,
      queryParameters: { filters: "isApproved:true AND reportsCount<5" },
    }],
  });
  return data.results?.[0]?.hits ?? [];
}

// ── Firestore fallback fetcher ────────────────────────────────────────────────
async function fetchFirestoreFeed(page: number) {
  const snap = await getAdminDb()
    .collection("posts")
    .where("isApproved", "==", true)
    .orderBy("createdAt", "desc")
    .limit(PAGE_SIZE)
    .offset(page * PAGE_SIZE)
    .get();

  const posts = snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((post) => {
    const value = post as { reportsCount?: number };
    return (value.reportsCount ?? 0) < 5;
  });
  return { posts, hasMore: snap.size === PAGE_SIZE };
}
