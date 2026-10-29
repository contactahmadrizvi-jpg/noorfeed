"use client";

import { useState, useEffect, useCallback } from "react";
import {
  doc,
  getDoc,
  writeBatch,
  increment,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  addDoc,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/context/AuthContext";
import { UserProfile } from "@/src/types";

// ── Fire-and-forget notification helper ─────────────────────────────────────
async function sendNotification(data: {
  toUserId: string;
  fromUserId: string;
  fromUsername: string;
  fromAvatar: string;
  type: "follow" | "like" | "comment" | "share" | "story_like";
  postId?: string;
  postThumb?: string;
}) {
  if (data.toUserId === data.fromUserId) return;
  try {
    await addDoc(collection(db, "notifications"), {
      ...data,
      postId: data.postId ?? null,
      postThumb: data.postThumb ?? null,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch { /* non-critical */ }
}

// ---------------------------------------------------------------------------
// useFollow — toggle follow/unfollow, Firestore as source of truth
// ---------------------------------------------------------------------------
export function useFollow(targetUid: string) {
  const { user, profile, followingCache, updateFollowingCache } = useAuth();
  const [isFollowing, setIsFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setIsFollowing(followingCache.has(targetUid));
  }, [followingCache, targetUid]);

  // Verify once from Firestore on mount in case cache hasn't hydrated
  useEffect(() => {
    if (!user || !targetUid) return;
    getDoc(doc(db, "follows", `${user.uid}_${targetUid}`)).then((snap) => {
      if (snap.exists()) {
        setIsFollowing(true);
        updateFollowingCache(targetUid, true);
      }
    });
  }, [user, targetUid, updateFollowingCache]);

  const toggle = useCallback(async () => {
    if (!user || !profile || busy || user.uid === targetUid) return;
    setBusy(true);

    const followDocId = `${user.uid}_${targetUid}`;
    const followRef  = doc(db, "follows", followDocId);
    const meRef      = doc(db, "users", user.uid);
    const themRef    = doc(db, "users", targetUid);

    try {
      const currentSnap = await getDoc(followRef);
      const alreadyFollowing = currentSnap.exists();
      const batch = writeBatch(db);

      if (alreadyFollowing) {
        batch.delete(followRef);
        batch.update(meRef,   { followingCount: increment(-1) });
        batch.update(themRef, { followersCount: increment(-1) });
        await batch.commit();
        setIsFollowing(false);
        updateFollowingCache(targetUid, false);
      } else {
        batch.set(followRef, {
          followerId:  user.uid,
          followingId: targetUid,
          timestamp:   serverTimestamp(),
        });
        batch.update(meRef,   { followingCount: increment(1) });
        batch.update(themRef, { followersCount: increment(1) });
        await batch.commit();
        setIsFollowing(true);
        updateFollowingCache(targetUid, true);

        // ── Send follow notification ──
        sendNotification({
          toUserId:    targetUid,
          fromUserId:  user.uid,
          fromUsername: profile.username,
          fromAvatar:  profile.avatarUrl,
          type:        "follow",
        });
      }
    } catch (e) {
      console.error("follow toggle error", e);
    } finally {
      setBusy(false);
    }
  }, [user, profile, targetUid, busy, updateFollowingCache]);

  return { isFollowing, busy, toggle };
}

// ---------------------------------------------------------------------------
// useFollowersList — real-time list of users following profileUid
// ---------------------------------------------------------------------------
export function useFollowersList(profileUid: string) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profileUid) return;
    setLoading(true);

    const q = query(
      collection(db, "follows"),
      where("followingId", "==", profileUid)
    );

    const unsub = onSnapshot(q, async (snap) => {
      const profiles = await Promise.all(
        snap.docs.map(async (d) => {
          const followerId = d.data().followerId as string;
          const userSnap = await getDoc(doc(db, "users", followerId));
          return userSnap.exists()
            ? ({ uid: userSnap.id, ...(userSnap.data() as Omit<UserProfile, "uid">) })
            : null;
        })
      );
      setUsers(profiles.filter(Boolean) as UserProfile[]);
      setLoading(false);
    });

    return () => unsub();
  }, [profileUid]);

  return { users, loading };
}

// ---------------------------------------------------------------------------
// useFollowingList — real-time list of users profileUid is following
// ---------------------------------------------------------------------------
export function useFollowingList(profileUid: string) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profileUid) return;
    setLoading(true);

    const q = query(
      collection(db, "follows"),
      where("followerId", "==", profileUid)
    );

    const unsub = onSnapshot(q, async (snap) => {
      const profiles = await Promise.all(
        snap.docs.map(async (d) => {
          const followingId = d.data().followingId as string;
          const userSnap = await getDoc(doc(db, "users", followingId));
          return userSnap.exists()
            ? ({ uid: userSnap.id, ...(userSnap.data() as Omit<UserProfile, "uid">) })
            : null;
        })
      );
      setUsers(profiles.filter(Boolean) as UserProfile[]);
      setLoading(false);
    });

    return () => unsub();
  }, [profileUid]);

  return { users, loading };
}
