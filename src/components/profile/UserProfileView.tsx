"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  doc,
  onSnapshot,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { UserProfile, Post } from "@/src/types";
import { useAuth } from "@/src/context/AuthContext";
import FollowButton from "./FollowButton";
import FollowList from "./FollowList";
import FeedCard from "@/src/components/feed/FeedCard";
import { Loader2, Grid3X3, Users, Bookmark, MessageSquare } from "lucide-react";

type Tab = "posts" | "saved" | "followers" | "following";

interface Props { uid: string }

function conversationId(a: string, b: string) {
  return [a, b].sort().join("_");
}

// ── Skeleton for the header while profile loads ──────────────────────────────
function ProfileSkeleton() {
  return (
    <div className="animate-pulse px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div className="h-20 w-20 shrink-0 rounded-full bg-slate-100" />
        <div className="flex flex-1 flex-col items-end gap-3">
          <div className="flex gap-6">
            {[1,2,3].map(i => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="h-5 w-8 rounded bg-slate-100" />
                <div className="h-3 w-12 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-4 w-32 rounded bg-slate-100" />
        <div className="h-3 w-24 rounded bg-slate-100" />
        <div className="h-3 w-48 rounded bg-slate-100" />
      </div>
    </div>
  );
}

export default function UserProfileView({ uid }: Props) {
  const { user: currentUser, profile: currentProfile, followingCache } = useAuth();
  const router = useRouter();

  // Profile loads independently — no auth gate
  const [profile, setProfile]         = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // Posts load independently
  const [posts, setPosts]             = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);

  // Saved — lazy
  const [savedPosts, setSavedPosts]   = useState<Post[]>([]);
  const [savedLoaded, setSavedLoaded] = useState(false);

  const [tab, setTab]                 = useState<Tab>("posts");
  const [theyFollowMe, setTheyFollowMe] = useState(false);

  // ── Profile doc — real-time, starts immediately ──────────────────────────
  useEffect(() => {
    if (!uid) return;
    setProfileLoading(true);
    const unsub = onSnapshot(doc(db, "users", uid), (snap) => {
      setProfile(
        snap.exists() ? { uid: snap.id, ...(snap.data() as Omit<UserProfile, "uid">) } : null
      );
      setProfileLoading(false);
    });
    return () => unsub();
  }, [uid]);

  // ── Posts — starts immediately alongside profile, limit 12 for fast paint ─
  useEffect(() => {
    if (!uid) return;
    setPostsLoading(true);
    const load = async () => {
      const q = query(
        collection(db, "posts"),
        where("userId", "==", uid),
        where("isApproved", "==", true),
        orderBy("createdAt", "desc"),
        limit(12)
      );
      const snap = await getDocs(q);
      setPosts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Post, "id">) })));
      setPostsLoading(false);
    };
    load();
  }, [uid]);

  // ── Mutual follow check — runs only when currentUser is known ────────────
  useEffect(() => {
    if (!currentUser || !uid || currentUser.uid === uid) return;
    getDoc(doc(db, "follows", `${uid}_${currentUser.uid}`)).then((snap) =>
      setTheyFollowMe(snap.exists())
    );
  }, [currentUser, uid]);

  // ── Saved posts (lazy) ───────────────────────────────────────────────────
  const loadSaved = async () => {
    if (savedLoaded) return;
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
    setPosts((p) => p.filter((x) => x.id !== id));
    setSavedPosts((p) => p.filter((x) => x.id !== id));
  };

  // ── Open / create DM ─────────────────────────────────────────────────────
  const openDM = async () => {
    if (!currentUser || !currentProfile || !profile) return;
    const cid = conversationId(currentUser.uid, uid);
    const convRef = doc(db, "conversations", cid);
    const snap = await getDoc(convRef);
    if (!snap.exists()) {
      await setDoc(convRef, {
        participantIds: [currentUser.uid, uid].sort(),
        participants: {
          [currentUser.uid]: {
            username: currentProfile.username,
            displayName: currentProfile.displayName,
            avatarUrl: currentProfile.avatarUrl,
          },
          [uid]: {
            username: profile.username,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
          },
        },
        lastMessage: "",
        lastMessageAt: serverTimestamp(),
        lastSenderId: "",
        unreadCounts: { [currentUser.uid]: 0, [uid]: 0 },
      });
    }
    router.push(`/messages/${cid}`);
  };

  const isOwn    = currentUser?.uid === uid;
  const iFollow  = !isOwn && !!currentUser && followingCache.has(uid);
  const isMutual = iFollow && theyFollowMe;

  // ── Render ───────────────────────────────────────────────────────────────

  // Profile not found (only after loading is done)
  if (!profileLoading && !profile && !isOwn) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <span className="text-5xl">🔍</span>
        <p className="font-semibold text-slate-700">User not found</p>
        <p className="text-sm text-slate-400">This account may not exist or has been removed.</p>
      </div>
    );
  }

  // Own profile, no doc yet → onboarding gate handles it
  if (!profileLoading && !profile && isOwn) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>;
  }

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
      {/* ── Header — shows skeleton while loading, then real data instantly ── */}
      {profileLoading || !profile ? (
        <ProfileSkeleton />
      ) : (
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
                <button onClick={() => handleTabChange("followers")} className="text-center hover:opacity-70 transition">
                  <p className="text-lg font-bold text-slate-900">{profile.followersCount}</p>
                  <p className="text-xs text-slate-500">Followers</p>
                </button>
                <button onClick={() => handleTabChange("following")} className="text-center hover:opacity-70 transition">
                  <p className="text-lg font-bold text-slate-900">{profile.followingCount}</p>
                  <p className="text-xs text-slate-500">Following</p>
                </button>
              </div>

              {isOwn && <button onClick={() => router.push("/settings/profile")} className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Edit profile</button>}
              {!isOwn && currentUser && (
                <div className="flex gap-2">
                  <FollowButton targetUid={uid} />
                  {isMutual && (
                    <button
                      onClick={openDM}
                      className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                    >
                      <MessageSquare className="h-4 w-4" />
                      Message
                    </button>
                  )}
                </div>
              )}
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
                {profile.interests.map((i) => (
                  <span key={i} className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                    {i}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex border-b border-slate-100">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => handleTabChange(t)}
            className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-medium capitalize transition ${
              tab === t ? "border-b-2 border-emerald-500 text-emerald-600" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {TAB_ICON[t]}
            {t}
          </button>
        ))}
      </div>

      {/* ── Posts tab ── */}
      {tab === "posts" && (
        <div className="space-y-4 px-4 pt-4">
          {postsLoading ? (
            // Skeleton cards while posts load
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse rounded-2xl border border-slate-100 bg-white p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-slate-100" />
                    <div className="space-y-1.5">
                      <div className="h-3 w-24 rounded bg-slate-100" />
                      <div className="h-3 w-16 rounded bg-slate-100" />
                    </div>
                  </div>
                  <div className="mt-3 h-40 rounded-xl bg-slate-100" />
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
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
