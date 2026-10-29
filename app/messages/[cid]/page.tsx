"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  updateDoc,
  arrayUnion,
  increment,
  serverTimestamp,
  writeBatch,
  getDocs,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { recordFeedSignal } from "@/src/lib/feedSignals";
import { Conversation, Message, Post } from "@/src/types";
import { useAuth } from "@/src/context/AuthContext";
import { usePresenceStatus } from "@/src/hooks/usePresence";
import {
  ArrowLeft,
  Send,
  Image as ImageIcon,
  Loader2,
  CheckCheck,
  Check,
} from "lucide-react";

const PAGE_SIZE = 30;
const REACTION_EMOJIS = ["❤️", "😂", "😮", "😢", "🤲", "👍"];

// ── Utility: deterministic conversation ID ───────────────────────────────────
function timeStr(ts: Message["createdAt"]): string {
  if (!ts) return "";
  const d = new Date(ts.toMillis ? ts.toMillis() : 0);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatPage({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = use(params);
  const { user, profile, requireAuth } = useAuth();
  const router = useRouter();

  const [convo, setConvo] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [reactionTarget, setReactionTarget] = useState<string | null>(null);
  const [sharePostOpen, setSharePostOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const initialScrollDone = useRef(false);

  // The other participant
  const markRead = useCallback(
    async (msgs: { id: string; readBy: string[] }[]) => {
      if (!user || !cid) return;
      const batch = writeBatch(db);
      // Reset unread count
      batch.update(doc(db, "conversations", cid), {
        [`unreadCounts.${user.uid}`]: 0,
      });
      // Mark each unread message as read
      msgs.forEach(({ id, readBy }) => {
        if (!readBy?.includes(user.uid)) {
          batch.update(doc(db, "conversations", cid, "messages", id), {
            readBy: arrayUnion(user.uid),
          });
        }
      });
      await batch.commit().catch(() => {});
    },
    [user, cid]
  );


  const otherId = convo?.participantIds.find((id) => id !== user?.uid) ?? null;
  const otherInfo = otherId ? convo?.participants[otherId] : null;
  const presence = usePresenceStatus(otherId);

  // ── Load conversation metadata ───────────────────────────────────────────
  useEffect(() => {
    if (!cid) return;
    const unsub = onSnapshot(doc(db, "conversations", cid), (snap) => {
      if (snap.exists()) {
        setConvo({ id: snap.id, ...(snap.data() as Omit<Conversation, "id">) });
      }
    });
    return () => unsub();
  }, [cid]);

  // ── Real-time messages (latest PAGE_SIZE, newest first from Firestore) ───
  useEffect(() => {
    if (!cid || !user) return;

    const q = query(
      collection(db, "conversations", cid, "messages"),
      orderBy("createdAt", "desc"),
      limit(PAGE_SIZE)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) { setHasMore(false); return; }
      cursorRef.current = snap.docs[snap.docs.length - 1];
      setHasMore(snap.docs.length === PAGE_SIZE);

      // Reverse so oldest is at top
      const msgs = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Message, "id">) }))
        .reverse();
      setMessages(msgs);

      // Scroll to bottom on first load
      if (!initialScrollDone.current) {
        setTimeout(() => bottomRef.current?.scrollIntoView(), 50);
        initialScrollDone.current = true;
      }

      // Mark messages as read
      markRead(snap.docs.map((d) => ({ id: d.id, readBy: d.data().readBy as string[] })));
    });

    return () => unsub();
  }, [cid, user, markRead]);

  // ── Reset unread count + mark individual messages read ───────────────────

  // ── Load older messages ───────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !cursorRef.current || !cid) return;
    setLoadingMore(true);
    const q = query(
      collection(db, "conversations", cid, "messages"),
      orderBy("createdAt", "desc"),
      startAfter(cursorRef.current),
      limit(PAGE_SIZE)
    );
    const snap = await getDocs(q);
    if (snap.empty) { setHasMore(false); setLoadingMore(false); return; }
    cursorRef.current = snap.docs[snap.docs.length - 1];
    setHasMore(snap.docs.length === PAGE_SIZE);
    const older = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Message, "id">) }))
      .reverse();
    setMessages((prev) => [...older, ...prev]);
    setLoadingMore(false);
  }, [hasMore, loadingMore, cid]);

  // Infinite scroll — watch top sentinel
  useEffect(() => {
    const el = topSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  // ── Send text message ─────────────────────────────────────────────────────
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !user || !profile || !otherId || sending) return;
    setSending(true);
    const msg: Omit<Message, "id"> = {
      conversationId: cid,
      senderId: user.uid,
      type: "text",
      text: text.trim(),
      postId: null,
      postSnapshot: null,
      reactions: {},
      readBy: [user.uid],
      createdAt: serverTimestamp() as Message["createdAt"],
    };
    const batch = writeBatch(db);
    const msgRef = doc(collection(db, "conversations", cid, "messages"));
    batch.set(msgRef, msg);
    batch.update(doc(db, "conversations", cid), {
      lastMessage: text.trim().slice(0, 80),
      lastMessageAt: serverTimestamp(),
      lastSenderId: user.uid,
      [`unreadCounts.${otherId}`]: increment(1),
    });
    await batch.commit();
    setText("");
    setSending(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  // ── Send a shared post ────────────────────────────────────────────────────
  const sendPost = async (post: Post) => {
    if (!user || !profile || !otherId) return;
    setSharePostOpen(false);
    const msg: Omit<Message, "id"> = {
      conversationId: cid,
      senderId: user.uid,
      type: "post",
      text: "",
      postId: post.id,
      postSnapshot: {
        title: post.title,
        mediaUrl: post.mediaUrl,
        mediaType: post.mediaType,
        username: post.username,
      },
      reactions: {},
      readBy: [user.uid],
      createdAt: serverTimestamp() as Message["createdAt"],
    };
    const batch = writeBatch(db);
    const msgRef = doc(collection(db, "conversations", cid, "messages"));
    batch.set(msgRef, msg);
    batch.update(doc(db, "conversations", cid), {
      lastMessage: `📎 Shared a post`,
      lastMessageAt: serverTimestamp(),
      lastSenderId: user.uid,
      [`unreadCounts.${otherId}`]: increment(1),
    });
    await batch.commit();
    recordFeedSignal(user.uid, post, "share");
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  // ── React to a message ────────────────────────────────────────────────────
  const reactToMessage = async (msgId: string, emoji: string) => {
    if (!user) return;
    setReactionTarget(null);
    const msgRef = doc(db, "conversations", cid, "messages", msgId);
    const msgSnap = await getDoc(msgRef);
    if (!msgSnap.exists()) return;
    const current: string[] = msgSnap.data().reactions?.[emoji] ?? [];
    const already = current.includes(user.uid);
    await updateDoc(msgRef, {
      [`reactions.${emoji}`]: already ? current.filter((id) => id !== user.uid) : arrayUnion(user.uid),
    });
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-slate-500">Sign in to view messages.</p>
        <button onClick={requireAuth} className="rounded-full bg-emerald-500 px-6 py-2 text-sm font-semibold text-white">Sign In</button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-56px)] flex-col bg-white">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-3">
        <button onClick={() => router.push("/messages")} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </button>

        {otherInfo?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={otherInfo.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-600">
            {otherInfo?.displayName?.[0]?.toUpperCase() ?? "?"}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{otherInfo?.displayName}</p>
          <p role="status" className={`flex items-center gap-1.5 text-xs ${presence.online ? "text-emerald-600" : "text-slate-400"}`}>
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${presence.online ? "bg-emerald-500 ring-2 ring-emerald-100" : "bg-slate-300"}`} />
            {presence.label}
          </p>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {/* Top sentinel for loading older messages */}
        <div ref={topSentinelRef} className="h-1" />
        {loadingMore && (
          <div className="flex justify-center py-2">
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          </div>
        )}

        {messages.map((msg, i) => {
          const isMine = msg.senderId === user.uid;
          const prev = messages[i - 1];
          const showAvatar = !isMine && prev?.senderId !== msg.senderId;
          const reactionEntries = Object.entries(msg.reactions ?? {}).filter(([, uids]) => uids.length > 0);
          const isRead = otherId ? msg.readBy?.includes(otherId) : false;

          return (
            <div key={msg.id} className={`flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
              {/* Other user avatar */}
              {!isMine && (
                <div className="shrink-0 w-7">
                  {showAvatar && otherInfo?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={otherInfo.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                  ) : showAvatar ? (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-600">
                      {otherInfo?.displayName?.[0]?.toUpperCase()}
                    </div>
                  ) : null}
                </div>
              )}

              <div className={`flex flex-col ${isMine ? "items-end" : "items-start"} max-w-[72%]`}>
                {/* Bubble */}
                <div
                  onDoubleClick={() => setReactionTarget(msg.id)}
                  className={`relative cursor-pointer rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    isMine
                      ? "rounded-br-sm bg-emerald-500 text-white"
                      : "rounded-bl-sm bg-slate-100 text-slate-900"
                  }`}
                >
                  {/* Post share card */}
                  {msg.type === "post" && msg.postSnapshot && msg.postId && (
                    <Link href={`/posts/${encodeURIComponent(msg.postId)}`} prefetch={false}
                      aria-label={`Open post by @${msg.postSnapshot.username}: ${msg.postSnapshot.title || "Shared post"}`}
                      className={`mb-1.5 block overflow-hidden rounded-xl border transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 ${isMine ? "border-emerald-400/40" : "border-slate-200"}`}>
                      {msg.postSnapshot.mediaUrl && msg.postSnapshot.mediaType === "image" && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={msg.postSnapshot.mediaUrl} alt="" className="h-32 w-full object-cover" loading="lazy" />
                      )}
                      {msg.postSnapshot.mediaType === "video" && <div className="flex h-24 items-center justify-center bg-black/10 text-sm">▶ Video post</div>}
                      <div className={`px-2 py-1.5 ${isMine ? "bg-emerald-600/30" : "bg-slate-50"}`}>
                        <p className="text-xs font-medium truncate">@{msg.postSnapshot.username}</p>
                        <p className="text-xs truncate opacity-80">{msg.postSnapshot.title || "View post"}</p>
                        <p className="mt-1 text-[10px] opacity-70">Tap to open post</p>
                      </div>
                    </Link>
                  )}

                  {msg.text && <span>{msg.text}</span>}
                </div>

                {/* Reactions */}
                {reactionEntries.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {reactionEntries.map(([emoji, uids]) => (
                      <button
                        key={emoji}
                        onClick={() => reactToMessage(msg.id, emoji)}
                        className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs ${
                          uids.includes(user.uid) ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {emoji} {uids.length}
                      </button>
                    ))}
                  </div>
                )}

                {/* Time + read receipt */}
                <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400">
                  <span>{timeStr(msg.createdAt)}</span>
                  {isMine && (
                    isRead
                      ? <CheckCheck className="h-3 w-3 text-emerald-500" />
                      : <Check className="h-3 w-3" />
                  )}
                </div>
              </div>

              {/* Reaction picker (double-tap) */}
              {reactionTarget === msg.id && (
                <div
                  className="fixed inset-0 z-50 flex items-end justify-center bg-black/20"
                  onClick={() => setReactionTarget(null)}
                >
                  <div className="mb-24 flex gap-2 rounded-2xl bg-white p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
                    {REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => reactToMessage(msg.id, emoji)}
                        className="text-2xl transition hover:scale-125"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ── */}
      <div className="border-t border-slate-100 bg-white px-3 py-2">
        <form onSubmit={sendMessage} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSharePostOpen(true)}
            className="shrink-0 rounded-full p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Share a post"
          >
            <ImageIcon className="h-5 w-5" />
          </button>

          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message…"
            className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
          />

          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white transition hover:bg-emerald-600 disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </div>

      {/* Share post picker */}
      {sharePostOpen && user && (
        <PostPickerSheet
          onSelect={sendPost}
          onClose={() => setSharePostOpen(false)}
        />
      )}
    </div>
  );
}

// ── Post picker — shows your own recent posts to share ───────────────────────
function PostPickerSheet({
  onSelect,
  onClose,
}: {
  onSelect: (p: Post) => void;
  onClose: () => void;
}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { collection, query, where, orderBy, limit, getDocs } = await import("firebase/firestore");
      const q = query(
        collection(db, "posts"),
        where("isApproved", "==", true),
        orderBy("createdAt", "desc"),
        limit(20)
      );
      const snap = await getDocs(q);
      setPosts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Post, "id">) })));
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-t-2xl bg-white shadow-2xl" style={{ maxHeight: "65vh" }}>
        <div className="flex justify-center pt-3 pb-2">
          <div className="h-1 w-10 rounded-full bg-slate-200" />
        </div>
        <div className="px-4 pb-3">
          <h3 className="text-base font-bold text-slate-900">Share a Post</h3>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: "calc(65vh - 80px)" }}>
          {loading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-emerald-500" /></div>}
          {!loading && posts.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">No posts to share.</p>
          )}
          {posts.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className="flex w-full items-center gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50"
            >
              {p.mediaUrl && p.mediaType === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.mediaUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" loading="lazy" />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-500">
                  <ImageIcon className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{p.title}</p>
                <p className="truncate text-xs text-slate-500">@{p.username}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
