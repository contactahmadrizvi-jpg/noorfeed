"use client";

import { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { Post, ISLAMIC_CATEGORIES, IslamicCategory } from "@/src/types";
import FeedCard from "@/src/components/feed/FeedCard";
import { Loader2 } from "lucide-react";

const CATEGORY_ICONS: Record<IslamicCategory, string> = {
  Quran: "📖",
  Hadith: "📜",
  "Daily Duas": "🤲",
  Seerah: "🕌",
  Fiqh: "⚖️",
  "Short Reminders": "💡",
  "Scholar Lectures": "🎓",
};

export default function ExplorePage() {
  const [active, setActive] = useState<IslamicCategory | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async (cat: IslamicCategory) => {
    setActive(cat);
    setLoading(true);
    try {
      const q = query(
        collection(db, "posts"),
        where("category", "==", cat),
        where("isApproved", "==", true),
        orderBy("createdAt", "desc"),
        limit(50)
      );
      const snap = await getDocs(q);
      setPosts(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Post, "id">) }))
          .filter((p) => p.reportsCount < 5)
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReported = (id: string) => setPosts((prev) => prev.filter((p) => p.id !== id));

  return (
    <div className="mx-auto max-w-xl pb-24">
      <div className="sticky top-14 z-10 bg-white px-4 py-4">
        <h1 className="mb-4 text-xl font-bold text-slate-900">Explore</h1>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {ISLAMIC_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => load(cat)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition ${
                active === cat
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300"
              }`}
            >
              <span>{CATEGORY_ICONS[cat]}</span>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {!active && (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <span className="text-5xl">🌙</span>
          <p className="font-semibold text-slate-700">Select a category to explore</p>
          <p className="text-sm text-slate-400">
            Browse Quran, Hadith, Duas, and more.
          </p>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        </div>
      )}

      {!loading && active && posts.length === 0 && (
        <p className="py-16 text-center text-sm text-slate-400">
          No posts in {active} yet.
        </p>
      )}

      <div className="space-y-4 px-4 pt-2">
        {posts.map((p) => (
          <FeedCard key={p.id} post={p} onReported={handleReported} />
        ))}
      </div>
    </div>
  );
}
