"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { ArrowLeft, Loader2 } from "lucide-react";
import { db } from "@/src/lib/firebase";
import { Post } from "@/src/types";
import FeedCard from "./FeedCard";
import RecommendedPosts from "./RecommendedPosts";

export default function PostDetail({ postId }: { postId: string }) {
  const router = useRouter();
  const [post, setPost] = useState<Post | null | undefined>(undefined);
  const [postError, setPostError] = useState(false);
  const [retryPost, setRetryPost] = useState(0);
  useEffect(() => onSnapshot(doc(db, "posts", postId), (snap) => {
    setPostError(false);
    const value = snap.exists() ? { ...snap.data(), id: snap.id } as Post : null;
    setPost(value?.isApproved && value.reportsCount < 5 ? value : null);
  }, () => setPostError(true)), [postId, retryPost]);
  return <div className="mx-auto max-w-xl pb-24">
    <div className="flex items-center gap-3 px-4 py-4"><button onClick={() => router.back()} aria-label="Go back" className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></button><h1 className="text-lg font-bold">Post</h1></div>
    <div className="sm:px-4">
      {postError ? <div role="alert" className="p-6 text-center text-sm text-red-600">Could not load this post. <button onClick={() => setRetryPost((n) => n + 1)} className="underline">Retry</button></div>
        : post === undefined ? <div role="status" className="flex justify-center py-12"><Loader2 aria-label="Loading post" className="h-6 w-6 animate-spin text-emerald-500" /></div>
        : post ? <FeedCard key={post.id} post={post} onReported={() => setPost(null)} />
        : <div className="rounded-2xl bg-slate-50 px-4 py-10 text-center"><h2 className="font-semibold">Post unavailable</h2><p className="mt-2 text-sm text-slate-500">This post may have been deleted or is no longer available.</p><Link href="/" className="mt-4 inline-block text-sm font-semibold text-emerald-600">Go to home</Link></div>}
    </div>
    <h2 className="px-4 pb-3 pt-8 font-bold text-slate-900">More for you</h2>
    <RecommendedPosts excludePostId={postId} />
  </div>;
}
