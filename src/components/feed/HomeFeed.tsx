"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { Post } from "@/src/types";
import { useAuth } from "@/src/context/AuthContext";
import { sortFeed } from "@/src/lib/feedAlgorithm";
import FeedCard from "./FeedCard";
import StoriesBar from "@/src/components/stories/StoriesBar";
import { Loader2 } from "lucide-react";

const PAGE_SIZE = 12;

// ── Skeleton card ─────────────────────────────────────────────────────────────
function FeedSkeleton() {
  return (
    <div className="animate-pulse border-b border-slate-100 bg-white sm:rounded-2xl sm:border sm:shadow-sm overflow-hidden">
      {/* Author row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="h-9 w-9 shrink-0 rounded-full bg-slate-100" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-28 rounded bg-slate-100" />
          <div className="h-2.5 w-16 rounded bg-slate-100" />
        </div>
        <div className="h-6 w-6 rounded-full bg-slate-100" />
      </div>
      {/* Category pill */}
      <div className="px-4 pb-2">
        <div className="h-5 w-20 rounded-full bg-slate-100" />
      </div>
      {/* Title */}
      <div className="px-4 pb-3 space-y-1.5">
        <div className="h-4 w-48 rounded bg-slate-100" />
        <div className="h-3 w-36 rounded bg-slate-100" />
      </div>
      {/* Media placeholder */}
      <div className="h-52 w-full bg-slate-100" />
      {/* Action bar */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="h-7 w-14 rounded-full bg-slate-100" />
        <div className="h-7 w-10 rounded-full bg-slate-100" />
        <div className="h-7 w-10 rounded-full bg-slate-100" />
        <div className="ml-auto h-7 w-8 rounded-full bg-slate-100" />
      </div>
    </div>
  );
}

export default function HomeFeed() {
  const { profile, followingCache } = useAuth();

  const [posts, setPosts]           = useState<Post[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]       = useState(true);
  const [error, setError]           = useState("");

  const cursorRef   = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // ── Initial load ──────────────────────────────────────────────────────────
  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError("");
    cursorRef.current = null;
    try {
      const q = query(
        collection(db, "posts"),
        where("isApproved", "==", true),
        orderBy("createdAt", "desc"),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      if (snap.empty) { setPosts([]); setHasMore(false); return; }
      cursorRef.current = snap.docs[snap.docs.length - 1];
      setHasMore(snap.docs.length === PAGE_SIZE);
      const raw = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Post, "id">) }));
      setPosts(sortFeed(raw, profile, followingCache));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load posts.");
    } finally {
      setLoading(false);
    }
  }, [profile, followingCache]);

  // ── Load more ─────────────────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !cursorRef.current) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, "posts"),
        where("isApproved", "==", true),
        orderBy("createdAt", "desc"),
        startAfter(cursorRef.current),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      if (snap.empty) { setHasMore(false); return; }
      cursorRef.current = snap.docs[snap.docs.length - 1];
      setHasMore(snap.docs.length === PAGE_SIZE);
      const newPosts = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Post, "id">) }));
      setPosts((prev) => {
        const merged = [...prev, ...newPosts.filter((p) => !prev.some((e) => e.id === p.id))];
        return sortFeed(merged, profile, followingCache);
      });
    } catch (err: unknown) {
      console.error("loadMore error", err);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, profile, followingCache]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  // ── Infinite scroll sentinel ──────────────────────────────────────────────
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { rootMargin: "400px" }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [loadMore]);

  const handleReported = (id: string) => setPosts((prev) => prev.filter((p) => p.id !== id));

  return (
    <div className="mx-auto w-full max-w-xl">
      {/* Stories bar */}
      <div className="mb-2 border-b border-slate-100 bg-white">
        <StoriesBar />
      </div>

      {/* ── Skeleton loading state ── */}
      {loading && (
        <div className="space-y-0 sm:space-y-4 sm:px-4 pt-2 pb-4">
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
          <button onClick={loadInitial} className="font-semibold underline">Retry</button>
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

      {/* Post cards */}
      {!loading && (
        <div className="space-y-0 sm:space-y-4 sm:px-4 pt-2 pb-8">
          {posts.map((post) => (
            <div key={post.id} className="sm:overflow-hidden sm:rounded-2xl">
              <FeedCard post={post} onReported={handleReported} />
            </div>
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" />

      {/* Loading-more indicator */}
      {loadingMore && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
        </div>
      )}

      {/* End of feed */}
      {!hasMore && posts.length > 0 && (
        <div className="pb-24 pt-4 text-center">
          <p className="text-xs text-slate-400">You've seen all posts · الحمد لله</p>
        </div>
      )}
    </div>
  );
}
