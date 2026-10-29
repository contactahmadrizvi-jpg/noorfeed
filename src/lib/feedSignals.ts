"use client";

import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/src/lib/firebase";
import { FeedAction, FeedSignals, applyFeedAction, emptyFeedSignals } from "./feedLearning";
import { Post } from "@/src/types";

const accounts = new Map<string, FeedSignals>();
const hydrated = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();
const storageKey = (uid: string) => `noorfeed:interests:v1:${uid}`;
export function getFeedSignals(uid: string | null): FeedSignals {
  if (!uid) return emptyFeedSignals();
  return accounts.get(uid) ?? emptyFeedSignals();
}
function valid(value: unknown): value is FeedSignals {
  if (!value || typeof value !== "object") return false;
  const data = value as FeedSignals;
  return typeof data.updatedAt === "number" && !!data.categories && !!data.authors && !!data.actions && !!data.seen;
}
function cache(uid: string, value: FeedSignals) {
  accounts.set(uid, value);
  try { localStorage.setItem(storageKey(uid), JSON.stringify(value)); } catch { /* Memory learning remains available. */ }
  listeners.forEach((notify) => notify());
}
function sync(uid: string) {
  const pending = timers.get(uid);
  if (pending) clearTimeout(pending);
  timers.set(uid, setTimeout(() => {
    timers.delete(uid);
    if (auth.currentUser?.uid !== uid) return;
    void updateDoc(doc(db, "users", uid), { feedSignals: getFeedSignals(uid) }).catch(() => { /* Retained locally and retried on the next interaction. */ });
  }, 2000));
}
export function hydrateFeedSignals(uid: string, remote?: FeedSignals) {
  if (!hydrated.has(uid)) {
    hydrated.add(uid);
    try { const stored: unknown = JSON.parse(localStorage.getItem(storageKey(uid)) ?? "null"); if (valid(stored)) accounts.set(uid, stored); } catch { /* No saved interests. */ }
  }
  const current = getFeedSignals(uid);
  if (valid(remote) && remote.updatedAt > current.updatedAt) cache(uid, remote);
  else if (current.updatedAt > (remote?.updatedAt ?? 0)) sync(uid);
}
export function recordFeedSignal(uid: string, post: Post, action: FeedAction, enabled = true) {
  if (auth.currentUser?.uid !== uid || uid === post.userId) return;
  hydrateFeedSignals(uid);
  const current = getFeedSignals(uid);
  const next = applyFeedAction(current, post, action, Date.now(), enabled);
  if (next === current) return;
  cache(uid, next);
  sync(uid);
}
export function subscribeFeedSignals(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
