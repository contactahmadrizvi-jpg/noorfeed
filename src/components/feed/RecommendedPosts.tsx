"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import { useFeedSignals } from "@/src/hooks/useFeedSignals";
import { getFeedSignals } from "@/src/lib/feedSignals";
import { RecommendationFeed } from "@/src/lib/recommendationFeed";
import { Post } from "@/src/types";
import FeedCard from "./FeedCard";

export default function RecommendedPosts({ excludePostId }: { excludePostId?: string }) {
  const { user } = useAuth();
  useFeedSignals();
  return <FeedSession key={`${user?.uid ?? "guest"}:${excludePostId ?? "home"}`} excludePostId={excludePostId} />;
}

function FeedSession({ excludePostId }: { excludePostId?: string }) {
  const { user, profile, followingCache, loading: authLoading } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");
  const [partial, setPartial] = useState(false);
  const feed = useRef<RecommendationFeed | null>(null);
  const lock = useRef(false);
  const active = useRef(true);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const loadMore = useCallback(async () => {
    if (lock.current || !hasMore || authLoading || (user && profile?.uid !== user.uid)) return;
    lock.current = true; setLoading(true); setError("");
    feed.current ??= new RecommendationFeed(excludePostId ? [excludePostId] : []);
    try {
      const result = await feed.current.next({ profile, following: followingCache, signals: getFeedSignals(user?.uid ?? null) });
      if (!active.current) return;
      setPosts((previous) => [...previous, ...result.posts.filter((post) => !previous.some((item) => item.id === post.id))]);
      setHasMore(result.hasMore); setPartial((previous) => previous || result.partial); setStarted(true);
    } catch (failure) { if (active.current) setError(failure instanceof Error ? failure.message : "Could not load posts. Please try again."); }
    finally { lock.current = false; if (active.current) setLoading(false); }
  }, [hasMore, authLoading, user, profile, followingCache, excludePostId]);
  useEffect(() => {
    const element = sentinel.current;
    if (!element || error) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) void loadMore(); }, { rootMargin: "500px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [loadMore, loading, error]);
  const remove = (id: string) => { feed.current?.exclude(id); setPosts((previous) => previous.filter((post) => post.id !== id)); };
  return <>
    <div className="space-y-0 pt-2 sm:space-y-4 sm:px-4">{posts.map((post) => <FeedCard key={post.id} post={post} onReported={remove} />)}</div>
    {partial && <p role="status" className="px-4 pt-4 text-xs text-slate-500">Some recommendations are unavailable. Showing the best matches we can load.</p>}
    {error && <div role="alert" className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error} <button onClick={() => void loadMore()} className="font-semibold underline">Retry</button></div>}
    {(loading || (!started && !error)) && <div role="status" className="flex justify-center py-10"><Loader2 aria-label="Loading your feed" className="h-6 w-6 animate-spin text-emerald-500" /></div>}
    <div ref={sentinel} className="h-1" />
    {started && !hasMore && <p className="px-4 pb-24 pt-8 text-center text-sm text-slate-500">{posts.length ? "You’re all caught up. Come back later for more." : "No posts to show yet."}</p>}
  </>;
}
