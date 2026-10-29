"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { Conversation, UserProfile } from "@/src/types";
import { useAuth } from "@/src/context/AuthContext";
import { useFollowersList } from "@/src/hooks/useFollow";
import { Loader2, MessageSquare, Plus, Search } from "lucide-react";

function timeAgo(ts: Conversation["lastMessageAt"]): string {
  if (!ts) return "";
  const ms = ts.toMillis ? ts.toMillis() : 0;
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

/** Derive the deterministic conversation ID from two UIDs */
function conversationId(a: string, b: string): string {
  return [a, b].sort().join("_");
}

export default function MessagesPage() {
  const { user, profile, requireAuth } = useAuth();
  const router = useRouter();
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Load the current user's conversations
  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const q = query(
      collection(db, "conversations"),
      where("participantIds", "array-contains", user.uid),
      orderBy("lastMessageAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      setConvos(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Conversation, "id">) }))
      );
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  const openConversation = async (otherUser: UserProfile) => {
    if (!user || !profile) return;
    const cid = conversationId(user.uid, otherUser.uid);
    const convRef = doc(db, "conversations", cid);
    const snap = await getDoc(convRef);

    if (!snap.exists()) {
      // Create the conversation document
      await setDoc(convRef, {
        participantIds: [user.uid, otherUser.uid].sort(),
        participants: {
          [user.uid]: {
            username: profile.username,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
          },
          [otherUser.uid]: {
            username: otherUser.username,
            displayName: otherUser.displayName,
            avatarUrl: otherUser.avatarUrl,
          },
        },
        lastMessage: "",
        lastMessageAt: serverTimestamp(),
        lastSenderId: "",
        unreadCounts: { [user.uid]: 0, [otherUser.uid]: 0 },
      });
    }

    setNewChatOpen(false);
    router.push(`/messages/${cid}`);
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center px-4">
        <MessageSquare className="h-12 w-12 text-slate-200" />
        <p className="font-semibold text-slate-700">Sign in to view messages</p>
        <button
          onClick={requireAuth}
          className="rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600"
        >
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl pb-24">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-5">
        <h1 className="text-xl font-bold text-slate-900">Messages</h1>
        <button
          onClick={() => setNewChatOpen(true)}
          className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
        >
          <Plus className="h-4 w-4" />
          New
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-emerald-500" />
        </div>
      )}

      {!loading && convos.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <MessageSquare className="h-12 w-12 text-slate-200" />
          <p className="font-semibold text-slate-700">No conversations yet</p>
          <p className="text-sm text-slate-400">
            Start a chat with someone you follow.
          </p>
          <button
            onClick={() => setNewChatOpen(true)}
            className="mt-2 rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600"
          >
            Start a conversation
          </button>
        </div>
      )}

      {/* Conversation list */}
      <div className="divide-y divide-slate-100">
        {convos.map((c) => {
          const otherId = c.participantIds.find((id) => id !== user.uid)!;
          const other = c.participants[otherId];
          const unread = c.unreadCounts?.[user.uid] ?? 0;

          return (
            <button
              key={c.id}
              onClick={() => router.push(`/messages/${c.id}`)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50"
            >
              {other?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={other.avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg font-bold text-emerald-600">
                  {other?.displayName?.[0]?.toUpperCase() ?? "?"}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className={`text-sm truncate ${unread > 0 ? "font-bold text-slate-900" : "font-semibold text-slate-800"}`}>
                    {other?.displayName}
                  </p>
                  <span className="ml-2 shrink-0 text-xs text-slate-400">
                    {timeAgo(c.lastMessageAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className={`text-sm truncate ${unread > 0 ? "font-medium text-slate-700" : "text-slate-400"}`}>
                    {c.lastMessage || "Tap to start chatting"}
                  </p>
                  {unread > 0 && (
                    <span className="ml-2 flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-white">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* New chat modal */}
      {newChatOpen && user && (
        <NewChatSheet
          currentUserId={user.uid}
          onSelect={openConversation}
          onClose={() => setNewChatOpen(false)}
        />
      )}
    </div>
  );
}

// ── New chat — shows mutual followers (people who follow you AND you follow) ──
function NewChatSheet({
  currentUserId,
  onSelect,
  onClose,
}: {
  currentUserId: string;
  onSelect: (u: UserProfile) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  // Mutual follows = people who follow ME
  const { users: followers, loading } = useFollowersList(currentUserId);

  // Filter to only people the current user also follows (mutual)
  const { followingCache } = useAuth();
  const mutual = followers.filter((u) => followingCache.has(u.uid));

  const filtered = search.trim()
    ? mutual.filter(
        (u) =>
          u.username.includes(search.toLowerCase()) ||
          u.displayName.toLowerCase().includes(search.toLowerCase())
      )
    : mutual;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-t-2xl bg-white shadow-2xl" style={{ maxHeight: "70vh" }}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="h-1 w-10 rounded-full bg-slate-200" />
        </div>

        <div className="px-4 pb-3">
          <h3 className="text-base font-bold text-slate-900 mb-3">New Message</h3>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search mutual followers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
            />
          </div>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: "calc(70vh - 130px)" }}>
          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">
              {mutual.length === 0
                ? "Follow someone back to start a conversation."
                : "No results found."}
            </p>
          )}
          {filtered.map((u) => (
            <button
              key={u.uid}
              onClick={() => onSelect(u)}
              className="flex w-full items-center gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50"
            >
              {u.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-600">
                  {u.displayName[0]?.toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-slate-900">{u.displayName}</p>
                <p className="text-xs text-slate-500">@{u.username}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
