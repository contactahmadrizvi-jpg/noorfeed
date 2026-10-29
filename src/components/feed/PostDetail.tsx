"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, startAfter, where, QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import { ArrowLeft, Loader2 } from "lucide-react";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/context/AuthContext";
import { sortFeed } from "@/src/lib/feedAlgorithm";
import { Post } from "@/src/types";
import FeedCard from "./FeedCard";

const PAGE_SIZE = 12;

export default function PostDetail({ postId }: { postId: string }) {
  const router = useRouter();
  const { profile, followingCache } = useAuth();
  const [post, setPost] = useState<Post | null | undefined>(undefined);
  const [postError, setPostError] = useState(false);
  const [retryPost, setRetryPost] = useState(0);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");
  const cursor = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const busy = useRef(false);
  const active = useRef(true);
  const sentinel = useRef<HTMLDivElement>(null);
  const excluded = useRef(new Set([postId]));
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => {
    return onSnapshot(doc(db, "posts", postId), (snap) => {
      setPostError(false);
      const value = snap.exists() ? { ...snap.data(), id: snap.id } as Post : null;
      setPost(value?.isApproved && value.reportsCount < 5 ? value : null);
    }, () => setPostError(true));
  }, [postId, retryPost]);

  const loadMore = useCallback(async () => {
    if (busy.current || !hasMore) return;
    busy.current = true;
    setLoading(true);
    setError("");
    try {
      const base = [where("isApproved", "==", true), orderBy("createdAt", "desc")];
      const request = query(collection(db, "posts"), ...base, ...(cursor.current ? [startAfter(cursor.current)] : []), limit(PAGE_SIZE));
      const snap = await getDocs(request);
      if (!active.current) return;
      cursor.current = snap.docs.at(-1) ?? cursor.current;
      setHasMore(snap.size === PAGE_SIZE);
      const batch = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Post)).filter((p) => !excluded.current.has(p.id));
      const ranked = sortFeed(batch, profile, followingCache);
      setPosts((previous) => [...previous, ...ranked.filter((p) => !previous.some((old) => old.id === p.id))]);
    } catch { if (active.current) setError("Could not load recommendations. Please try again."); }
    finally { busy.current = false; if (active.current) setLoading(false); }
  }, [hasMore, profile, followingCache]);

  useEffect(() => {
    const element = sentinel.current;
    if (!element || error) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) void loadMore(); }, { rootMargin: "500px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [loadMore, error, loading]);

  const remove = (id: string) => {
    excluded.current.add(id);
    if (id === postId) setPost(null);
    setPosts((previous) => previous.filter((p) => p.id !== id));
  };
  return <div className="mx-auto max-w-xl pb-24">
    <div className="flex items-center gap-3 px-4 py-4">
      <button onClick={() => router.back()} aria-label="Go back" className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></button>
      <h1 className="text-lg font-bold">Post</h1>
    </div>
    <div className="sm:px-4">
      {postError ? <div role="alert" className="p-6 text-center text-sm text-red-600">Could not load this post. <button onClick={() => setRetryPost((n) => n + 1)} className="underline">Retry</button></div>
        : post === undefined ? <div role="status" className="flex justify-center py-12"><Loader2 aria-label="Loading post" className="h-6 w-6 animate-spin text-emerald-500" /></div>
        : post ? <FeedCard key={post.id} post={post} onReported={remove} />
        : <div className="rounded-2xl bg-slate-50 px-4 py-10 text-center"><h2 className="font-semibold">Post unavailable</h2><p className="mt-2 text-sm text-slate-500">This post may have been deleted or is no longer available.</p><Link href="/" className="mt-4 inline-block text-sm font-semibold text-emerald-600">Go to home</Link></div>}
    </div>
    <h2 className="px-4 pb-3 pt-8 font-bold text-slate-900">More for you</h2>
    <div className="space-y-4 sm:px-4">{posts.map((item) => <FeedCard key={item.id} post={item} onReported={remove} />)}</div>
    {error && <div role="alert" className="px-4 py-6 text-sm text-red-600">{error} <button onClick={() => void loadMore()} className="underline">Retry</button></div>}
    {loading && <div role="status" className="flex justify-center py-6"><Loader2 aria-label="Loading recommendations" className="h-5 w-5 animate-spin text-emerald-500" /></div>}
    <div ref={sentinel} className="h-1" />
    {!hasMore && <p className="py-8 text-center text-xs text-slate-400">{posts.length ? "You’re all caught up." : "No more posts to show yet."}</p>}
  </div>;
}
