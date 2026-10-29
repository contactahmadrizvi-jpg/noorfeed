"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  doc,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { Notification } from "@/src/types";
import { useAuth } from "@/src/context/AuthContext";
import {
  Heart,
  MessageCircle,
  Share2,
  UserPlus,
  Loader2,
  Bell,
  ImageIcon,
  Clapperboard,
} from "lucide-react";

const TYPE_ICON: Record<Notification["type"], React.ReactNode> = {
  follow:     <UserPlus      className="h-4 w-4 text-emerald-500" />,
  like:       <Heart         className="h-4 w-4 text-red-400 fill-red-400" />,
  comment:    <MessageCircle className="h-4 w-4 text-blue-400" />,
  share:      <Share2        className="h-4 w-4 text-purple-400" />,
  story_like: <Heart         className="h-4 w-4 text-pink-400 fill-pink-400" />,
};

const TYPE_TEXT: Record<Notification["type"], string> = {
  follow:     "started following you",
  like:       "liked your post",
  comment:    "commented on your post",
  share:      "shared your post",
  story_like: "liked your story",
};

const TYPE_COLOR: Record<Notification["type"], string> = {
  follow:     "text-emerald-600",
  like:       "text-red-500",
  comment:    "text-blue-500",
  share:      "text-purple-500",
  story_like: "text-pink-500",
};

function timeAgo(ts: Notification["createdAt"]): string {
  if (!ts) return "";
  const ms = ts.toMillis ? ts.toMillis() : Date.now();
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Isolated thumbnail component — owns its own error state ─────────────────
function NotifThumb({ url, type }: { url?: string | null; type: Notification["type"] }) {
  const [errored, setErrored] = useState(false);
  const hasUrl = url && url.trim() !== "";
  const Fallback = type === "story_like" ? Clapperboard : ImageIcon;

  return (
    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-100">
      {hasUrl && !errored ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url!}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Fallback className="h-5 w-5 text-slate-300" />
        </div>
      )}
    </div>
  );
}

const showThumb = (t: Notification["type"]) =>
  t === "like" || t === "comment" || t === "share" || t === "story_like";

export default function NotificationsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const q = query(
      collection(db, "notifications"),
      where("toUserId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, async (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Notification, "id">),
      }));
      setNotifs(list);
      setLoading(false);

      const unreadDocs = snap.docs.filter((d) => !d.data().read);
      if (unreadDocs.length > 0) {
        const batch = writeBatch(db);
        unreadDocs.forEach((d) =>
          batch.update(doc(db, "notifications", d.id), { read: true })
        );
        await batch.commit();
      }
    });

    return () => unsub();
  }, [user]);

  const unreadCount = notifs.filter((n) => !n.read).length;

  return (
    <div className="mx-auto max-w-xl pb-24">
      <div className="flex items-center gap-3 px-4 py-5">
        <h1 className="text-xl font-bold text-slate-900">Notifications</h1>
        {unreadCount > 0 && (
          <span className="rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white">
            {unreadCount} new
          </span>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        </div>
      )}

      {!loading && !user && (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <Bell className="h-12 w-12 text-slate-200" />
          <p className="text-slate-500">Sign in to see your notifications.</p>
        </div>
      )}

      {!loading && user && notifs.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <Bell className="h-12 w-12 text-slate-200" />
          <p className="font-semibold text-slate-700">No notifications yet</p>
          <p className="text-sm text-slate-400">
            When people follow or interact with you, it shows up here.
          </p>
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {notifs.map((n) => (
          <button
            key={n.id}
            onClick={() => router.push(`/profile/${n.fromUserId}`)}
            className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50 ${
              !n.read ? "bg-emerald-50/60" : ""
            }`}
          >
            {/* Avatar + type badge */}
            <div className="relative shrink-0">
              {n.fromAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={n.fromAvatar} alt="" className="h-11 w-11 rounded-full object-cover" />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-600">
                  {n.fromUsername[0]?.toUpperCase()}
                </div>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-100">
                {TYPE_ICON[n.type]}
              </span>
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-800 leading-snug">
                <span className="font-semibold">@{n.fromUsername}</span>{" "}
                <span className={TYPE_COLOR[n.type]}>{TYPE_TEXT[n.type]}</span>
              </p>
              <p className="mt-0.5 text-xs text-slate-400">{timeAgo(n.createdAt)}</p>
            </div>

            {/* Thumbnail — isolated component handles its own error state */}
            {showThumb(n.type) && (
              <NotifThumb url={n.postThumb} type={n.type} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
