"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/src/context/AuthContext";
import { Post } from "@/src/types";
import { RecommendationFeed } from "@/src/lib/recommendationFeed";
import { getFeedSignals } from "@/src/lib/feedSignals";
import { sortFeed } from "@/src/lib/feedAlgorithm";
import FeedCard from "./FeedCard";
import { Loader2 } from "lucide-react";

// ── Skeleton card ─────────────────────────────────────────────────────────────
function FeedSkeleton() {
  return (
    <div className="animate-pulse border-b border-slate-100 bg-white sm:rounded-2xl sm:border sm:shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="h-9 w-9 shrink-0 rounded-full bg-slate-100" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-28 rounded bg-slate-100" />
          <div className="h-2.5 w-16 rounded bg-slate-100" />
        </div>
        <div className="h-6 w-6 rounded-full bg-slate-100" />
      </div>
      <div className="px-4 pb-2"><div className="h-5 w-20 rounded-full bg-slate-100" /></div>
      <div className="px-4 pb-3 space-y-1.5">
        <div className="h-4 w-48 rounded bg-slate-100" />
        <div className="h-3 w-36 rounded bg-slate-100" />
      </div>
      <div className="h-52 w-full bg-slate-100" />
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="h-7 w-14 rounded-full bg-slate-100" />
        <div className="h-7 w-10 rounded-full bg-slate-100" />
        <div className="h-7 w-10 rounded-full bg-slate-100" />
        <div className="ml-auto h-7 w-8 rounded-full bg-slate-100" />
      </div>
    </div>
  );
}

export default function RecommendedPosts({ excludePostId }: { excludePostId?: string }) {
  const { user } = useAuth();
  return <FeedSession key={`${user?.uid ?? "guest"}:${excludePostId ?? "home"}`} excludePostId={excludePostId} />;
}

function FeedSession({ excludePostId }: { excludePostId?: string }) {
  const { user, profile, followingCache } = useAuth();
  const [posts, setPosts]         = useState<Post[]>([]);
  const nextPageRef = useRef(0);
  const browserFallbackRef = useRef(false);
  const browserFeedRef = useRef<RecommendationFeed | null>(null);
  const inFlightRef = useRef(false);
  const [loading, setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]     = useState(true);
  const [error, setError]         = useState("");
  const [source, setSource]       = useState<"algolia" | "firestore" | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async (pageNum: number, append = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");

    try {
      let json: { posts: Post[]; source: "algolia" | "firestore"; hasMore?: boolean };
      if (!browserFallbackRef.current) {
        const res = await fetch(
          `/api/feed/personalized?page=${pageNum}`,
          { credentials: "include" }
        );
        const result = await res.json();
        if (!res.ok) throw new Error(result?.error || "Unable to load the feed. Please try again.");
        browserFallbackRef.current = result.clientFallback === true;
        json = result;
      } else {
        json = { posts: [], source: "firestore" };
      }
      let fallbackHasMore: boolean | undefined;
      if (browserFallbackRef.current) {
        if (pageNum === 0) browserFeedRef.current = null;
        browserFeedRef.current ??= new RecommendationFeed(excludePostId ? [excludePostId] : []);
        const result = await browserFeedRef.current.next({ profile, following: followingCache, signals: getFeedSignals(user?.uid ?? null) });
        fallbackHasMore = result.hasMore;
        json = { posts: result.posts, source: "firestore" };
      }

      const rawPosts: Post[] = (json.posts ?? []).map((p) =>
        // Algolia returns objectID instead of id — normalise
        ({ ...p, id: (p as Post & { objectID?: string }).objectID ?? p.id })
      );

      setSource(json.source);
      setHasMore(fallbackHasMore ?? json.hasMore ?? rawPosts.length === 12);

      nextPageRef.current = pageNum + 1;
      const scored = sortFeed(rawPosts.filter((post) => post.id !== excludePostId), profile, followingCache);

      setPosts((prev) => {
        if (!append) return scored;
        const existingIds = new Set(prev.map((p) => p.id));
        return [...prev, ...scored.filter((p) => !existingIds.has(p.id))];
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load posts.");
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user, profile, followingCache, excludePostId]);

  // Initial load
  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchPage(0); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchPage]);

  // Infinite scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || loading || loadingMore || error || !hasMore) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !inFlightRef.current) {
          void fetchPage(nextPageRef.current, true);
        }
      },
      { rootMargin: "400px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loading, loadingMore, error, hasMore, fetchPage]);

  const handleReported = (id: string) =>
    setPosts((prev) => prev.filter((p) => p.id !== id));

  return (
    <div className="w-full">
      {/* Source badge */}
      {source && !loading && (
        <div className="px-4 pb-1">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            source === "algolia"
              ? "bg-blue-50 text-blue-600"
              : "bg-slate-100 text-slate-500"
          }`}>
            {source === "algolia" ? "✦ Personalised" : "Recent"}
          </span>
        </div>
      )}

      {/* Skeleton */}
      {loading && (
        <div className="space-y-0 sm:space-y-4 sm:px-4 pb-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="sm:overflow-hidden sm:rounded-2xl">
              <FeedSkeleton />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}{" "}
          <button onClick={() => fetchPage(nextPageRef.current, nextPageRef.current > 0)} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && posts.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <span className="text-5xl">🌙</span>
          <p className="font-semibold text-slate-700">No posts yet</p>
          <p className="text-sm text-slate-400">Be the first to share something!</p>
        </div>
      )}

      {/* Cards */}
      {!loading && (
        <div className="space-y-0 sm:space-y-4 sm:px-4 pb-8">
          {posts.map((post) => (
            <div key={post.id} className="sm:overflow-hidden sm:rounded-2xl">
              <FeedCard post={post} onReported={handleReported} />
            </div>
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" />

      {loadingMore && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
        </div>
      )}

      {!hasMore && posts.length > 0 && (
        <div className="pb-24 pt-4 text-center">
          <p className="text-xs text-slate-400">You&apos;ve seen all posts · الحمد لله</p>
        </div>
      )}
    </div>
  );
}
