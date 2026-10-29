"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { Loader2, Search, Send, X } from "lucide-react";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/context/AuthContext";
import { Post, UserProfile } from "@/src/types";
import { sharePostToConversation } from "@/src/lib/sharePost";

export default function SharePostSheet({ post, onClose }: { post: Post; onClose: () => void }) {
  const { user, profile } = useAuth();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const [recipients, setRecipients] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let active = true;
    if (!user) return;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [outgoing, incoming] = await Promise.all([
          getDocs(query(collection(db, "follows"), where("followerId", "==", user!.uid))),
          getDocs(query(collection(db, "follows"), where("followingId", "==", user!.uid))),
        ]);
        const following = new Set(outgoing.docs.map((d) => d.data().followingId as string));
        const mutual = [...new Set(incoming.docs.map((d) => d.data().followerId as string))]
          .filter((id) => id !== user!.uid && following.has(id));
        const profiles = await Promise.all(mutual.map(async (id) => {
          const snap = await getDoc(doc(db, "users", id));
          return snap.exists() ? { ...snap.data(), uid: snap.id } as UserProfile : null;
        }));
        if (active) setRecipients(profiles.filter((p): p is UserProfile => p !== null));
      } catch {
        if (active) { setRecipients([]); setError("Could not load mutual followers. Please try again."); }
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [user, retry]);

  async function send(recipient: UserProfile) {
    if (!user || !profile || profile.uid !== user.uid || lock.current) return;
    lock.current = true;
    setSending(recipient.uid);
    setError("");
    try {
      const cid = await sharePostToConversation(profile, recipient, post);
      router.push(`/messages/${cid}`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send this post. Please try again.");
    } finally { lock.current = false; setSending(null); }
  }

  const term = search.trim().toLowerCase();
  const filtered = recipients.filter((p) => `${p.displayName} ${p.username}`.toLowerCase().includes(term));
  return (
    <dialog ref={dialog} aria-labelledby="share-post-title"
      onCancel={(e) => { e.preventDefault(); if (!lock.current) onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget && !lock.current) onClose(); }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 mx-auto w-full max-w-lg rounded-t-2xl border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm sm:mb-8 sm:rounded-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
        <h2 id="share-post-title" className="font-bold">Share post to messages</h2>
        <button onClick={onClose} disabled={!!sending} aria-label="Close sharing" className="rounded-full p-2 text-slate-400 hover:bg-slate-50 disabled:opacity-50"><X className="h-5 w-5" /></button>
      </div>
      <div className="space-y-3 px-4 py-3">
        <p className="truncate text-sm font-medium">@{post.username} · {post.title || post.caption || "Post"}</p>
        <p className="text-xs text-slate-500">Send to someone you follow who also follows you.</p>
        <label className="relative block"><span className="sr-only">Search mutual followers</span>
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search mutual followers…" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm outline-none focus:border-emerald-400" />
        </label>
        {error && <div role="alert" className="text-sm text-red-600">{error} <button disabled={!!sending} onClick={() => setRetry((n) => n + 1)} className="font-semibold underline">Refresh list</button></div>}
      </div>
      <div className="max-h-[45vh] overflow-y-auto pb-4" aria-busy={loading || !!sending}>
        {loading ? <div role="status" className="flex justify-center py-8"><Loader2 aria-label="Loading recipients" className="h-5 w-5 animate-spin text-emerald-500" /></div> : <>
          {!error && filtered.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">{recipients.length ? "No results found." : "No mutual followers yet. Follow each other to share posts."}</p>}
          {filtered.map((recipient) => <button key={recipient.uid} disabled={!!sending || !profile} onClick={() => void send(recipient)} className="flex w-full items-center gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 disabled:opacity-50">
            {recipient.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={recipient.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-600">{recipient.displayName?.[0]?.toUpperCase()}</span>}
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{recipient.displayName}</span><span className="block truncate text-xs text-slate-500">@{recipient.username}</span></span>
            {sending === recipient.uid ? <Loader2 aria-label="Sending post" className="h-4 w-4 animate-spin text-emerald-500" /> : <Send aria-label="Send post" className="h-4 w-4 text-emerald-500" />}
          </button>)}
        </>}
      </div>
    </dialog>
  );
}
