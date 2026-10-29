"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  doc,
  onSnapshot,
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment,
  collection,
  addDoc,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { Story, UserProfile } from "@/src/types";
import { useAuth } from "@/src/context/AuthContext";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Heart,
  Users,
} from "lucide-react";

interface Props {
  stories: Story[];
  startIndex: number;
  onClose: () => void;
}

// ── Fire-and-forget notification ────────────────────────────────────────────
async function sendNotification(data: {
  toUserId: string;
  fromUserId: string;
  fromUsername: string;
  fromAvatar: string;
  type: "story_like";
  postThumb?: string;
}) {
  if (data.toUserId === data.fromUserId) return;
  try {
    await addDoc(collection(db, "notifications"), {
      ...data,
      postId: null,
      postThumb: data.postThumb ?? null,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch { /* non-critical */ }
}

export default function StoryViewer({ stories, startIndex, onClose }: Props) {
  const { user, profile } = useAuth();

  const [index, setIndex] = useState(startIndex);
  const [progress, setProgress] = useState(0);

  // Real-time story data for the currently displayed story
  const [liveStory, setLiveStory] = useState<Story>(stories[index]);

  // Viewer list panel (owner only)
  const [viewerListOpen, setViewerListOpen] = useState(false);
  const [viewers, setViewers] = useState<UserProfile[]>([]);
  const [viewersLoading, setViewersLoading] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(Date.now());
  const viewedThisSession = useRef<Set<string>>(new Set());

  const current = stories[index]; // base story from prop (has id)
  const durationMs = Math.min(60, Math.max(1, liveStory?.duration ?? 7)) * 1000;
  const isOwn = user?.uid === current?.userId;
  const liked = user ? (liveStory?.likedBy ?? []).includes(user.uid) : false;

  // ── Real-time listener for the current story doc ────────────────────────
  useEffect(() => {
    if (!current?.id) return;
    const unsub = onSnapshot(doc(db, "stories", current.id), (snap) => {
      if (snap.exists()) {
        setLiveStory({ id: snap.id, ...(snap.data() as Omit<Story, "id">) });
      }
    });
    return () => unsub();
  }, [current?.id]);

  // Reset liveStory to the static prop data when index changes
  // (the listener above will immediately update it with fresh data)
  useEffect(() => {
    if (stories[index]) setLiveStory(stories[index]);
  }, [index, stories]);

  // ── Record view — checks both in-session Set AND the Firestore viewedBy array ──
  const recordView = useCallback(
    async (story: Story) => {
      if (!user || user.uid === story.userId) return;
      // Guard 1: already counted this session (in-memory, fast)
      if (viewedThisSession.current.has(story.id)) return;
      // Guard 2: check the live story's viewedBy array — handles page reloads/remounts
      // liveStory is the most current data from the onSnapshot listener
      const alreadyViewed = (liveStory?.viewedBy ?? story.viewedBy ?? []).includes(user.uid);
      if (alreadyViewed) {
        // Mark in session so we don't check Firestore again this session
        viewedThisSession.current.add(story.id);
        return;
      }
      viewedThisSession.current.add(story.id);
      try {
        await updateDoc(doc(db, "stories", story.id), {
          viewedBy: arrayUnion(user.uid),
          viewsCount: increment(1),
        });
      } catch { /* non-critical */ }
    },
    [user, liveStory]
  );

  useEffect(() => {
    if (current) recordView(current);
  }, [current, recordView]);

  // ── Navigation ───────────────────────────────────────────────────────────
  const goNext = useCallback(() => {
    if (index < stories.length - 1) {
      setIndex((i) => i + 1);
      setProgress(0);
      setViewerListOpen(false);
    } else {
      onClose();
    }
  }, [index, stories.length, onClose]);

  const goPrev = useCallback(() => {
    if (index > 0) {
      setIndex((i) => i - 1);
      setProgress(0);
      setViewerListOpen(false);
    }
  }, [index]);

  // ── Auto-advance timer ───────────────────────────────────────────────────
  useEffect(() => {
    startRef.current = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min((elapsed / durationMs) * 100, 100);
      setProgress(pct);
      if (pct >= 100) goNext();
    }, 50);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [index, durationMs, goNext]);

  // Pause timer while viewer list is open
  useEffect(() => {
    if (viewerListOpen) {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [viewerListOpen]);

  // ── Keyboard nav ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "Escape") { if (viewerListOpen) setViewerListOpen(false); else onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, onClose, viewerListOpen]);

  // ── Tap to navigate ──────────────────────────────────────────────────────
  const handleTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    if (viewerListOpen) return;
    if (e.clientX < window.innerWidth / 2) goPrev(); else goNext();
  };

  // ── Like story ───────────────────────────────────────────────────────────
  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || !profile || isOwn) return;
    const storyRef = doc(db, "stories", current.id);
    if (liked) {
      await updateDoc(storyRef, {
        likedBy: arrayRemove(user.uid),
        likesCount: increment(-1),
      });
    } else {
      await updateDoc(storyRef, {
        likedBy: arrayUnion(user.uid),
        likesCount: increment(1),
      });
      sendNotification({
        toUserId:    current.userId,
        fromUserId:  user.uid,
        fromUsername: profile.username,
        fromAvatar:  profile.avatarUrl,
        type:        "story_like",
        postThumb:   current.mediaUrl,
      });
    }
  };

  // ── Load viewer profiles (owner only) ────────────────────────────────────
  const loadViewers = async () => {
    setViewersLoading(true);
    const viewedByIds: string[] = liveStory?.viewedBy ?? [];
    const profiles = await Promise.all(
      viewedByIds.map(async (uid) => {
        const snap = await getDoc(doc(db, "users", uid));
        return snap.exists()
          ? ({ uid: snap.id, ...(snap.data() as Omit<UserProfile, "uid">) })
          : null;
      })
    );
    setViewers(profiles.filter(Boolean) as UserProfile[]);
    setViewersLoading(false);
  };

  const toggleViewerList = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!viewerListOpen) loadViewers();
    setViewerListOpen((v) => !v);
  };

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black"
      role="dialog"
      aria-modal="true"
    >
      {/* ── Progress bars ── */}
      <div className="absolute top-3 left-3 right-3 z-10 flex gap-1">
        {stories.map((s, i) => (
          <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
            <div
              className="h-full rounded-full bg-white"
              style={{
                width: i < index ? "100%" : i === index ? `${progress}%` : "0%",
                transition: i === index ? "none" : undefined,
              }}
            />
          </div>
        ))}
      </div>

      {/* ── Header ── */}
      <div className="absolute top-7 left-4 right-14 z-10 flex items-center gap-2">
        {current.userAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.userAvatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover border-2 border-white" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-white">
            {current.username[0]?.toUpperCase()}
          </div>
        )}
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-white drop-shadow leading-none">
            @{current.username}
          </span>
          <span className="text-[11px] text-white/60 leading-none mt-0.5">
            {liveStory?.duration ?? 7}s
          </span>
        </div>

        {/* Owner: eye count button that opens viewer list */}
        {isOwn && (
          <button
            onClick={toggleViewerList}
            className="ml-auto flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-1 text-xs font-semibold text-white hover:bg-black/60 transition"
          >
            <Eye className="h-3.5 w-3.5" />
            {liveStory?.viewsCount ?? 0}
          </button>
        )}
      </div>

      {/* ── Close ── */}
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-7 z-10 rounded-full bg-black/30 p-1.5 text-white hover:bg-black/50 transition"
      >
        <X className="h-5 w-5" />
      </button>

      {/* ── Media ── */}
      <div className="relative h-full w-full max-w-sm cursor-pointer" onClick={handleTap}>
        {current.mediaType === "video" ? (
          <video key={current.id} src={current.mediaUrl} autoPlay muted playsInline className="h-full w-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={current.id} src={current.mediaUrl} alt="story" className="h-full w-full object-cover" />
        )}

        <button aria-label="Previous" onClick={(e) => { e.stopPropagation(); goPrev(); }}
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/20 p-1 text-white opacity-0 hover:opacity-100 transition">
          <ChevronLeft className="h-6 w-6" />
        </button>
        <button aria-label="Next" onClick={(e) => { e.stopPropagation(); goNext(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/20 p-1 text-white opacity-0 hover:opacity-100 transition">
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      {/* ── Bottom bar ── */}
      <div className="absolute bottom-0 left-0 right-0 z-10 max-w-sm mx-auto px-4 pb-8">
        {isOwn ? (
          /* Owner: shows viewer count + likes count */
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={toggleViewerList}
              className="flex items-center gap-1.5 rounded-full bg-black/50 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm hover:bg-black/70 transition"
            >
              <Users className="h-4 w-4 text-emerald-400" />
              {liveStory?.viewsCount ?? 0} {(liveStory?.viewsCount ?? 0) === 1 ? "view" : "views"}
            </button>
            <span className="flex items-center gap-1.5 rounded-full bg-black/50 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
              <Heart className="h-4 w-4 text-red-400 fill-red-400" />
              {liveStory?.likesCount ?? 0}
            </span>
          </div>
        ) : (
          /* Viewer: like button */
          user && (
            <div className="flex justify-center">
              <button
                onClick={handleLike}
                className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition backdrop-blur-sm ${
                  liked
                    ? "bg-red-500/80 text-white"
                    : "bg-black/40 text-white hover:bg-black/60"
                }`}
              >
                <Heart className={`h-4 w-4 ${liked ? "fill-white" : ""}`} />
                {liked ? "Liked" : "Like"}
                {(liveStory?.likesCount ?? 0) > 0 && (
                  <span className="ml-0.5 opacity-80">{liveStory.likesCount}</span>
                )}
              </button>
            </div>
          )
        )}
      </div>

      {/* ── Viewer list slide-up panel (owner only) ── */}
      {viewerListOpen && isOwn && (
        <div
          className="absolute bottom-0 left-0 right-0 z-20 max-w-sm mx-auto rounded-t-2xl bg-white shadow-2xl"
          style={{ maxHeight: "60vh" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="h-1 w-10 rounded-full bg-slate-200" />
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-slate-500" />
              <span className="font-semibold text-slate-900 text-sm">
                Viewers ({liveStory?.viewsCount ?? 0})
              </span>
            </div>
            <button onClick={() => setViewerListOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: "calc(60vh - 80px)" }}>
            {viewersLoading && (
              <div className="flex justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              </div>
            )}
            {!viewersLoading && viewers.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-400">No views yet.</p>
            )}
            {viewers.map((v) => (
              <div key={v.uid} className="flex items-center gap-3 px-4 py-3 border-b border-slate-50">
                {v.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-600">
                    {v.displayName[0]?.toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-slate-900">{v.displayName}</p>
                  <p className="text-xs text-slate-500">@{v.username}</p>
                </div>
                {/* Show if this viewer also liked */}
                {(liveStory?.likedBy ?? []).includes(v.uid) && (
                  <Heart className="ml-auto h-4 w-4 text-red-400 fill-red-400 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
