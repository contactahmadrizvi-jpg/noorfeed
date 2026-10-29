/**
 * Post view tracker — optimised for minimal Firestore writes.
 *
 * Rules:
 *  1. Never count the post author's own views.
 *  2. Count each viewer only once per browser session (in-memory Set).
 *  3. Debounce the write by 2 s so rapidly scrolled-past cards don't trigger writes.
 *  4. Only write when the card has been visible for ≥ 1.5 s (handled by caller).
 */

import { doc, updateDoc, increment } from "firebase/firestore";
import { db } from "@/src/lib/firebase";

// In-memory set — survives the session, cleared on page reload
const viewedThisSession = new Set<string>();

// Pending debounce timers keyed by postId
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function trackPostView(postId: string, postAuthorId: string, viewerUid: string | null) {
  // Guest views are not tracked (no uid)
  if (!viewerUid) return;
  // Don't count own views
  if (viewerUid === postAuthorId) return;
  // Already counted this session
  if (viewedThisSession.has(postId)) return;

  // Clear any existing debounce for this post
  const existing = pendingTimers.get(postId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    pendingTimers.delete(postId);
    // Double-check after the debounce delay (user may have scrolled back)
    if (viewedThisSession.has(postId)) return;
    viewedThisSession.add(postId);
    try {
      await updateDoc(doc(db, "posts", postId), {
        viewsCount: increment(1),
      });
    } catch {
      // Non-critical — remove from set so it can retry
      viewedThisSession.delete(postId);
    }
  }, 2000); // 2 s debounce

  pendingTimers.set(postId, timer);
}

export function cancelPostViewTracking(postId: string) {
  const timer = pendingTimers.get(postId);
  if (timer) {
    clearTimeout(timer);
    pendingTimers.delete(postId);
  }
}
