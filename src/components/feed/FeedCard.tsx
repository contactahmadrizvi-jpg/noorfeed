"use client";

import { useState, useRef, useCallback, useEffect, memo } from "react";
import { useRouter } from "next/navigation";
import {
  doc,
  updateDoc,
  increment,
  arrayUnion,
  arrayRemove,
  collection,
  addDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { Post, Comment, UserProfile } from "@/src/types";
import { useAuth } from "@/src/context/AuthContext";
import VideoPlayer from "./VideoPlayer";
import { trackPostView, cancelPostViewTracking } from "@/src/lib/postViewTracker";
import {
  Heart,
  Bookmark,
  MessageCircle,
  Share2,
  MoreHorizontal,
  Flag,
  Send,
  CornerDownRight,
  X,
  SmilePlus,
  Loader2,
  Eye,
} from "lucide-react";

interface Props {
  post: Post;
  onReported: (id: string) => void;
}

const REACTION_EMOJIS = ["❤️", "😂", "😮", "😢", "🤲", "👍"];
const PAGE_SIZE = 10; // comments per page

// ── Fire-and-forget notification ─────────────────────────────────────────────
async function sendNotification(data: {
  toUserId: string;
  fromUserId: string;
  fromUsername: string;
  fromAvatar: string;
  type: "like" | "comment" | "follow" | "share" | "story_like";
  postId?: string;
  postThumb?: string;
}) {
  if (data.toUserId === data.fromUserId) return;
  try {
    await addDoc(collection(db, "notifications"), {
      ...data,
      postId: data.postId ?? null,
      postThumb:
        data.postThumb && data.postThumb.trim() !== "" ? data.postThumb : null,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch { /* non-critical */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wrapped with React.memo — only re-renders if the post object reference changes
// ─────────────────────────────────────────────────────────────────────────────
function FeedCard({ post, onReported }: Props) {
  const { user, profile, requireAuth } = useAuth();
  const router = useRouter();
  const cardRef = useRef<HTMLElement>(null);

  const [liked, setLiked] = useState(
    user
      ? (post as Post & { likedBy?: string[] }).likedBy?.includes(user.uid) ?? false
      : false
  );
  const [saved, setSaved] = useState(
    user
      ? (post as Post & { savedBy?: string[] }).savedBy?.includes(user.uid) ?? false
      : false
  );
  const [likes, setLikes] = useState(post.likesCount);
  const [saves, setSaves] = useState(post.savesCount);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reported, setReported] = useState(false);

  // ── Who liked modal ──────────────────────────────────────────────────────
  const [likersOpen, setLikersOpen] = useState(false);
  const [likers, setLikers] = useState<UserProfile[]>([]);
  const [likersLoading, setLikersLoading] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Comments ─────────────────────────────────────────────────────────────
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string } | null>(null);
  const [reactionPickerOpen, setReactionPickerOpen] = useState<string | null>(null);

  const postRef = doc(db, "posts", post.id);
  const isOwn = user?.uid === post.userId;

  // ── View tracking — fires once after card is visible for 1.5 s ──────────
  useEffect(() => {
    const card = cardRef.current;
    if (!card || !user) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          trackPostView(post.id, post.userId, user.uid);
        } else {
          cancelPostViewTracking(post.id);
        }
      },
      { threshold: 0.5 }
    );
    obs.observe(card);
    return () => {
      obs.disconnect();
      cancelPostViewTracking(post.id);
    };
  }, [post.id, post.userId, user]);

  // ── Long-press to show likers ────────────────────────────────────────────
  const loadLikers = useCallback(async () => {
    setLikersLoading(true);
    const ids: string[] = (post as Post & { likedBy?: string[] }).likedBy ?? [];
    // Fetch up to 50 likers — avoids unbounded reads
    const slice = ids.slice(0, 50);
    const profiles = await Promise.all(
      slice.map(async (uid) => {
        const snap = await getDoc(doc(db, "users", uid));
        return snap.exists()
          ? ({ uid: snap.id, ...(snap.data() as Omit<UserProfile, "uid">) })
          : null;
      })
    );
    setLikers(profiles.filter(Boolean) as UserProfile[]);
    setLikersLoading(false);
  }, [post]);

  const handleLongPressStart = useCallback(() => {
    longPressTimer.current = setTimeout(() => {
      setLikersOpen(true);
      loadLikers();
    }, 500);
  }, [loadLikers]);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  // ── Like ──────────────────────────────────────────────────────────────────
  const handleLike = async () => {
    if (!user || !profile) { requireAuth(); return; }
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    await updateDoc(postRef, {
      likesCount: increment(next ? 1 : -1),
      likedBy: next ? arrayUnion(user.uid) : arrayRemove(user.uid),
    });
    if (next) {
      sendNotification({
        toUserId: post.userId,
        fromUserId: user.uid,
        fromUsername: profile.username,
        fromAvatar: profile.avatarUrl,
        type: "like",
        postId: post.id,
        postThumb: post.mediaUrl || undefined,
      });
    }
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!user || !profile) { requireAuth(); return; }
    const next = !saved;
    setSaved(next);
    setSaves((n) => n + (next ? 1 : -1));
    await updateDoc(postRef, {
      savesCount: increment(next ? 1 : -1),
      savedBy: next ? arrayUnion(user.uid) : arrayRemove(user.uid),
    });
  };

  // ── Share ─────────────────────────────────────────────────────────────────
  const handleShare = async () => {
    const url = `${window.location.origin}/profile/${post.userId}`;
    if (navigator.share) {
      await navigator.share({ title: post.title, url });
    } else {
      await navigator.clipboard.writeText(url);
    }
    await updateDoc(postRef, { sharesCount: increment(1) });
  };

  // ── Report ────────────────────────────────────────────────────────────────
  const handleReport = async () => {
    if (reported) return;
    setReported(true);
    setMenuOpen(false);
    await updateDoc(postRef, { reportsCount: increment(1) });
    onReported(post.id);
  };

  // ── Comments (load once, paginate client-side) ────────────────────────────
  const loadComments = useCallback(async () => {
    if (commentsLoaded) return;
    const q = query(
      collection(db, "comments"),
      where("postId", "==", post.id),
      orderBy("createdAt", "asc")
    );
    const snap = await getDocs(q);
    setComments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Comment, "id">) })));
    setCommentsLoaded(true);
  }, [commentsLoaded, post.id]);

  const toggleComments = async () => {
    if (!commentsOpen) await loadComments();
    setCommentsOpen((v) => !v);
  };

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !commentText.trim()) return;
    setSubmitting(true);
    const data: Omit<Comment, "id"> = {
      postId: post.id,
      userId: user.uid,
      username: profile.username,
      userAvatar: profile.avatarUrl,
      text: commentText.trim(),
      reactions: {},
      replyTo: replyingTo?.id ?? null,
      replyToUsername: replyingTo?.username ?? null,
      createdAt: serverTimestamp() as Comment["createdAt"],
    };
    const ref = await addDoc(collection(db, "comments"), data);
    setComments((prev) => [...prev, { id: ref.id, ...data }]);
    setCommentText("");
    setReplyingTo(null);
    setSubmitting(false);
    sendNotification({
      toUserId: post.userId,
      fromUserId: user.uid,
      fromUsername: profile.username,
      fromAvatar: profile.avatarUrl,
      type: "comment",
      postId: post.id,
      postThumb: post.mediaUrl || undefined,
    });
  };

  const handleReaction = async (commentId: string, emoji: string) => {
    if (!user) { requireAuth(); return; }
    setReactionPickerOpen(null);
    const commentRef = doc(db, "comments", commentId);
    const fieldPath = `reactions.${emoji}`;
    setComments((prev) =>
      prev.map((c) => {
        if (c.id !== commentId) return c;
        const cur = c.reactions?.[emoji] ?? [];
        const already = cur.includes(user.uid);
        return {
          ...c,
          reactions: {
            ...c.reactions,
            [emoji]: already ? cur.filter((id) => id !== user.uid) : [...cur, user.uid],
          },
        };
      })
    );
    const comment = comments.find((c) => c.id === commentId);
    const already = comment?.reactions?.[emoji]?.includes(user.uid);
    await updateDoc(commentRef, {
      [fieldPath]: already ? arrayRemove(user.uid) : arrayUnion(user.uid),
    });
  };

  const timeAgo = (ts: Post["createdAt"]) => {
    if (!ts) return "";
    const ms = ts.toMillis ? ts.toMillis() : Date.now();
    const diff = (Date.now() - ms) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  };

  const topComments = comments.filter((c) => !c.replyTo);
  const repliesFor = (parentId: string) => comments.filter((c) => c.replyTo === parentId);

  return (
    <>
      <article
        ref={cardRef}
        className="overflow-hidden border-b border-slate-100 bg-white sm:rounded-2xl sm:border sm:shadow-sm"
      >
        {/* ── Author header ── */}
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => router.push(`/profile/${post.userId}`)}
            className="flex items-center gap-3"
          >
            {post.userAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.userAvatar}
                alt=""
                className="h-9 w-9 rounded-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-600">
                {post.username[0]?.toUpperCase()}
              </div>
            )}
            <div className="text-left">
              <p className="text-sm font-semibold text-slate-900">@{post.username}</p>
              <p className="text-xs text-slate-400">{timeAgo(post.createdAt)}</p>
            </div>
          </button>

          <div className="flex items-center gap-2">
            {/* ── View count chip — always shown to the post author ── */}
            {isOwn && (
              <span className="flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-xs text-slate-500 border border-slate-100">
                <Eye className="h-3 w-3" />
                {post.viewsCount ?? 0}
              </span>
            )}

            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100"
                aria-label="More options"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-10 mt-1 w-40 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-lg">
                  <button
                    onClick={handleReport}
                    disabled={reported}
                    className="flex w-full items-center gap-2 px-4 py-3 text-sm text-red-500 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    <Flag className="h-4 w-4" />
                    {reported ? "Reported" : "Report post"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Category + title + caption */}
        <div className="px-4 pb-1">
          <span className="inline-block rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            {post.category}
          </span>
        </div>
        {post.title && (
          <div className="px-4 pb-2">
            <h3 className="font-semibold text-slate-900">{post.title}</h3>
          </div>
        )}
        {post.caption && (
          <div className="px-4 pb-3">
            <p className="text-sm leading-relaxed text-slate-700">{post.caption}</p>
          </div>
        )}

        {/* ── Media ── */}
        {post.mediaUrl && (
          post.mediaType === "video" ? (
            <VideoPlayer src={post.mediaUrl} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.mediaUrl}
              alt={post.title}
              className="w-full object-cover"
              style={{ maxHeight: "480px" }}
              loading="lazy"
              decoding="async"
            />
          )
        )}

        {/* ── Action bar ── */}
        <div className="flex items-center gap-1 px-4 py-3">
          <button
            onClick={handleLike}
            onMouseDown={handleLongPressStart}
            onMouseUp={handleLongPressEnd}
            onMouseLeave={handleLongPressEnd}
            onTouchStart={handleLongPressStart}
            onTouchEnd={handleLongPressEnd}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition select-none ${
              liked ? "bg-red-50 text-red-500" : "text-slate-500 hover:bg-slate-50"
            }`}
            aria-label={liked ? "Unlike" : "Like"}
          >
            <Heart className={`h-4 w-4 ${liked ? "fill-red-500" : ""}`} />
            {likes > 0 && <span>{likes}</span>}
          </button>

          <button
            onClick={toggleComments}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
              commentsOpen ? "bg-blue-50 text-blue-500" : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            <MessageCircle className="h-4 w-4" />
            {comments.length > 0 && <span>{comments.length}</span>}
          </button>

          <button
            onClick={handleSave}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
              saved ? "bg-emerald-50 text-emerald-600" : "text-slate-500 hover:bg-slate-50"
            }`}
            aria-label={saved ? "Unsave" : "Save"}
          >
            <Bookmark className={`h-4 w-4 ${saved ? "fill-emerald-500" : ""}`} />
            {saves > 0 && <span>{saves}</span>}
          </button>

          <button
            onClick={handleShare}
            className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-50"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>

        {/* ── Comments panel ── */}
        {commentsOpen && (
          <div className="border-t border-slate-100 px-4 pb-4">
            <div className="space-y-4 pt-3">
              {topComments.length === 0 && (
                <p className="text-center text-sm text-slate-400">No comments yet. Be the first!</p>
              )}

              {topComments.map((c) => {
                const replies = repliesFor(c.id);
                const reactionEntries = Object.entries(c.reactions ?? {}).filter(
                  ([, uids]) => uids.length > 0
                );
                return (
                  <div key={c.id} className="space-y-2">
                    <div className="flex gap-2">
                      {c.userAvatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.userAvatar} alt="" loading="lazy" className="h-7 w-7 shrink-0 rounded-full object-cover mt-0.5" />
                      ) : (
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500 mt-0.5">
                          {c.username[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="rounded-2xl bg-slate-50 px-3 py-2">
                          <p className="text-xs font-semibold text-slate-700">@{c.username}</p>
                          <p className="mt-0.5 text-sm text-slate-800">{c.text}</p>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 pl-1">
                          {reactionEntries.map(([emoji, uids]) => (
                            <button key={emoji} onClick={() => handleReaction(c.id, emoji)}
                              className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs transition ${user && uids.includes(user.uid) ? "bg-emerald-100 text-emerald-700 font-semibold" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                              <span>{emoji}</span><span>{uids.length}</span>
                            </button>
                          ))}
                          {user && (
                            <div className="relative">
                              <button onClick={() => setReactionPickerOpen(reactionPickerOpen === c.id ? null : c.id)}
                                className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-100">
                                <SmilePlus className="h-3.5 w-3.5" />
                              </button>
                              {reactionPickerOpen === c.id && (
                                <div className="absolute bottom-full left-0 z-20 mb-1 flex gap-1 rounded-2xl border border-slate-100 bg-white px-2 py-1.5 shadow-lg">
                                  {REACTION_EMOJIS.map((emoji) => (
                                    <button key={emoji} onClick={() => handleReaction(c.id, emoji)}
                                      className="rounded-full p-1 text-base transition hover:scale-125 hover:bg-slate-50">{emoji}</button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {user && (
                            <button onClick={() => setReplyingTo(replyingTo?.id === c.id ? null : { id: c.id, username: c.username })}
                              className="flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-600">
                              <CornerDownRight className="h-3.5 w-3.5" />Reply
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {replies.length > 0 && (
                      <div className="ml-9 space-y-2 border-l-2 border-slate-100 pl-3">
                        {replies.map((r) => {
                          const rReactions = Object.entries(r.reactions ?? {}).filter(([, uids]) => uids.length > 0);
                          return (
                            <div key={r.id} className="flex gap-2">
                              {r.userAvatar ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={r.userAvatar} alt="" loading="lazy" className="h-6 w-6 shrink-0 rounded-full object-cover mt-0.5" />
                              ) : (
                                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500 mt-0.5">
                                  {r.username[0]?.toUpperCase()}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="rounded-2xl bg-slate-50 px-3 py-2">
                                  <p className="text-xs font-semibold text-slate-700">
                                    @{r.username}
                                    {r.replyToUsername && <span className="ml-1 font-normal text-emerald-600">→ @{r.replyToUsername}</span>}
                                  </p>
                                  <p className="mt-0.5 text-sm text-slate-800">{r.text}</p>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 pl-1">
                                  {rReactions.map(([emoji, uids]) => (
                                    <button key={emoji} onClick={() => handleReaction(r.id, emoji)}
                                      className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs transition ${user && uids.includes(user.uid) ? "bg-emerald-100 text-emerald-700 font-semibold" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                                      <span>{emoji}</span><span>{uids.length}</span>
                                    </button>
                                  ))}
                                  {user && (
                                    <div className="relative">
                                      <button onClick={() => setReactionPickerOpen(reactionPickerOpen === r.id ? null : r.id)}
                                        className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-100">
                                        <SmilePlus className="h-3.5 w-3.5" />
                                      </button>
                                      {reactionPickerOpen === r.id && (
                                        <div className="absolute bottom-full left-0 z-20 mb-1 flex gap-1 rounded-2xl border border-slate-100 bg-white px-2 py-1.5 shadow-lg">
                                          {REACTION_EMOJIS.map((emoji) => (
                                            <button key={emoji} onClick={() => handleReaction(r.id, emoji)}
                                              className="rounded-full p-1 text-base transition hover:scale-125 hover:bg-slate-50">{emoji}</button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {user && profile ? (
              <div className="mt-4 space-y-2">
                {replyingTo && (
                  <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    <CornerDownRight className="h-4 w-4 shrink-0" />
                    <span>Replying to <strong>@{replyingTo.username}</strong></span>
                    <button onClick={() => setReplyingTo(null)} className="ml-auto shrink-0 text-emerald-500 hover:text-emerald-700">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <form onSubmit={submitComment} className="flex gap-2">
                  <input type="text" value={commentText} onChange={(e) => setCommentText(e.target.value)}
                    placeholder={replyingTo ? `Reply to @${replyingTo.username}…` : "Add a comment…"}
                    className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                  />
                  <button type="submit" disabled={submitting || !commentText.trim()}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white transition hover:bg-emerald-600 disabled:opacity-50">
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </div>
            ) : (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm text-slate-500">Sign in to join the conversation.</p>
                <button onClick={requireAuth} className="shrink-0 rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600">
                  Sign in
                </button>
              </div>
            )}
          </div>
        )}
      </article>

      {/* ── Who liked modal ── */}
      {likersOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setLikersOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl bg-white shadow-2xl"
            style={{ maxHeight: "60vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-slate-200" />
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <Heart className="h-4 w-4 fill-red-400 text-red-400" />
                <span className="text-sm font-semibold text-slate-900">
                  {likes} {likes === 1 ? "Like" : "Likes"}
                </span>
              </div>
              <button onClick={() => setLikersOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: "calc(60vh - 80px)" }}>
              {likersLoading && (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
                </div>
              )}
              {!likersLoading && likers.length === 0 && (
                <p className="py-10 text-center text-sm text-slate-400">No likes yet.</p>
              )}
              {likers.map((u) => (
                <button key={u.uid}
                  onClick={() => { setLikersOpen(false); router.push(`/profile/${u.uid}`); }}
                  className="flex w-full items-center gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50"
                >
                  {u.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.avatarUrl} alt="" loading="lazy" className="h-9 w-9 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-600">
                      {u.displayName[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{u.displayName}</p>
                    <p className="text-xs text-slate-500">@{u.username}</p>
                  </div>
                  <Heart className="ml-auto h-4 w-4 shrink-0 fill-red-400 text-red-400" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default memo(FeedCard);
