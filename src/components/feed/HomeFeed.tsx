"use client";

import StoriesBar from "@/src/components/stories/StoriesBar";
import RecommendedPosts from "./RecommendedPosts";

export default function HomeFeed() {
  return <div className="mx-auto w-full max-w-xl pb-20">
    <div className="mb-2 border-b border-slate-100 bg-white"><StoriesBar /></div>
    <div className="px-4 pb-1 pt-3"><h1 className="font-bold text-slate-900">For you</h1><p className="mt-1 text-xs text-slate-500">Your interests first, with something new to discover.</p></div>
    <RecommendedPosts />
  </div>;
}
