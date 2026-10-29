"use client";

import { useEffect, useState } from "react";
import {
  doc,
  onSnapshot,
  collection,
  query,
  where,
  getDocs,
  orderBy,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { UserProfile, Post } from "@/src/types";
import { useAuth } from "@/src/context/AuthContext";
import FollowButton from "./FollowButton";
import FollowList from "./FollowList";
import FeedCard from "@/src/components/feed/FeedCard";
import { Loader2, Grid3X3, Users, Bookmark } from "lucide-react";

type Tab = "posts" | "saved" | "followers" | "following";

interface Props {
  uid: string;
}

export default function UserProfileView({ uid }: Props) {
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [savedPosts, setSavedPosts] = useState<Post[]>([]);
  const [savedLoaded, setSavedLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("posts");
  const [profileLoading, setProfileLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(true);

  // ── Real-time user doc ───────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) return;
    setProfileLoading(true);
    const unsub = onSnapshot(doc(db, "users", uid), (snap) => {
      if (snap.exists()) {
        setProfile({ uid: snap.id, ...(snap.data() as Omit<UserProfile, "uid">) });
      } else {
        setProfile(null);
      }
      setProfileLoading(false);
    });
    return () => unsub();
  }, [uid]);

  // ── User's posts (one-time) ──────────────────────────────────────────────
  useEffect(() => {
    if (!uid) return;
    setPostsLoading(true);
    const load = async () => {
      const q = query(
        collection(db, "posts"),
        where("userId", "==", uid),
        where("isApproved", "==", true),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      setPosts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Post, "id">) })));
      setPostsLoading(false);
    };
    load();
  }, [uid]);

  // ── Saved posts — lazy loaded when tab is selected ───────────────────────
  const loadSaved = async () => {
    if (savedLoaded) return;
    // Posts where current user's uid is in savedBy array
    const q = query(
      collection(db, "posts"),
      where("savedBy", "array-contains", uid),
      where("isApproved", "==", true),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    setSavedPosts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Post, "id">) })));
    setSavedLoaded(true);
  };

  const handleTabChange = (t: Tab) => {
    setTab(t);
    if (t === "saved") loadSaved();
  };

  const handleReported = (id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
    setSavedPosts((prev) => prev.filter((p) => p.id !== id));
  };

  const loading = profileLoading || postsLoading;
  const isOwn = currentUser?.uid === uid;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!profile && isOwn) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <span className="text-5xl">🔍</span>
        <p className="font-semibold text-slate-700">User not found</p>
        <p className="text-sm text-slate-400">This account may not exist or has been removed.</p>
      </div>
    );
  }

  // Only show the Saved tab on your own profile
  const tabs: Tab[] = isOwn
    ? ["posts", "saved", "followers", "following"]
    : ["posts", "followers", "following"];

  const TAB_ICON: Record<Tab, React.ReactNode> = {
    posts:     <Grid3X3  className="h-4 w-4" />,
    saved:     <Bookmark className="h-4 w-4" />,
    followers: <Users    className="h-4 w-4" />,
    following: <Users    className="h-4 w-4" />,
  };

  return (
    <div className="mx-auto max-w-xl pb-24">
      {/* ── Header ── */}
      <div className="px-4 py-6">
        <div className="flex items-start justify-between gap-4">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt={profile.displayName}
              className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-emerald-200"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-2xl font-bold text-emerald-600 ring-2 ring-emerald-200">
              {profile.displayName[0]?.toUpperCase()}
            </div>
          )}

          <div className="flex flex-1 flex-col items-end gap-3">
            <div className="flex gap-6 text-center">
              <div>
                <p className="text-lg font-bold text-slate-900">{posts.length}</p>
                <p className="text-xs text-slate-500">Posts</p>
              </div>
              <button onClick={() => handleTabChange("followers")} className="text-center transition hover:opacity-70">
                <p className="text-lg font-bold text-slate-900">{profile.followersCount}</p>
                <p className="text-xs text-slate-500">Followers</p>
              </button>
              <button onClick={() => handleTabChange("following")} className="text-center transition hover:opacity-70">
                <p className="text-lg font-bold text-slate-900">{profile.followingCount}</p>
                <p className="text-xs text-slate-500">Following</p>
              </button>
            </div>
            {!isOwn && currentUser && <FollowButton targetUid={uid} />}
          </div>
        </div>

        <div className="mt-4">
          <p className="font-bold text-slate-900">{profile.displayName}</p>
          <p className="text-sm text-slate-500">@{profile.username}</p>
          {profile.bio && (
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{profile.bio}</p>
          )}
          {profile.interests.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {profile.interests.map((interest) => (
                <span key={interest} className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  {interest}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-slate-100">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => handleTabChange(t)}
            className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-medium capitalize transition ${
              tab === t
                ? "border-b-2 border-emerald-500 text-emerald-600"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {TAB_ICON[t]}
            {t}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {tab === "posts" && (
        <div className="space-y-4 px-4 pt-4">
          {posts.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No posts yet.</p>
          ) : (
            posts.map((p) => <FeedCard key={p.id} post={p} onReported={handleReported} />)
          )}
        </div>
      )}

      {tab === "saved" && (
        <div className="space-y-4 px-4 pt-4">
          {!savedLoaded ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
            </div>
          ) : savedPosts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <Bookmark className="h-10 w-10 text-slate-200" />
              <p className="text-sm text-slate-400">No saved posts yet.</p>
            </div>
          ) : (
            savedPosts.map((p) => <FeedCard key={p.id} post={p} onReported={handleReported} />)
          )}
        </div>
      )}

      {tab === "followers" && <FollowList profileUid={uid} mode="followers" />}
      {tab === "following" && <FollowList profileUid={uid} mode="following" />}
    </div>
  );
}
