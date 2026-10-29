"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where, Query, DocumentData } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { Story } from "@/src/types";
import { canViewStory } from "@/src/lib/storyAudience";

export function useVisibleStories(uid: string | null) {
  const [result, setResult] = useState<{ uid: string | null; stories: Story[]; error: string }>({ uid: null, stories: [], error: "" });
  useEffect(() => {
    let active = true;
    let generation = 0;
    const sources = new Map<string, Story[]>();
    const failures = new Set<string>();
    let following = new Set<string>();
    let followedSubscriptions: (() => void)[] = [];
    const publish = () => {
      if (!active) return;
      const now = Date.now();
      const merged = new Map<string, Story>();
      for (const list of sources.values()) for (const story of list) {
        if (story.expiresAt > now && canViewStory(story, uid, following)) merged.set(story.id, story);
      }
      setResult({ uid, stories: [...merged.values()].sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)).slice(0, 50),
        error: failures.size ? "Some stories could not be loaded. Please refresh to try again." : "" });
    };
    const subscribe = (key: string, request: Query<DocumentData>, version?: number) => onSnapshot(request, (snap) => {
      if (!active || (version !== undefined && version !== generation)) return;
      failures.delete(key);
      sources.set(key, snap.docs.map((item) => ({ ...item.data(), id: item.id } as Story)));
      publish();
    }, () => {
      if (!active || (version !== undefined && version !== generation)) return;
      failures.add(key); sources.delete(key); publish();
    });
    const publicSubscription = subscribe("public", query(collection(db, "stories"), where("audience", "==", "public"), orderBy("createdAt", "desc"), limit(50)));
    const ownSubscription = uid ? subscribe("own", query(collection(db, "stories"), where("userId", "==", uid), orderBy("createdAt", "desc"), limit(50))) : () => {};
    const followSubscription = uid ? onSnapshot(query(collection(db, "follows"), where("followerId", "==", uid)), (snap) => {
      generation++;
      followedSubscriptions.forEach((unsubscribe) => unsubscribe());
      followedSubscriptions = [];
      for (const key of sources.keys()) if (key.startsWith("following:")) sources.delete(key);
      for (const key of failures) if (key.startsWith("following:")) failures.delete(key);
      failures.delete("follows");
      following = new Set(snap.docs.map((item) => item.data().followingId as string));
      publish();
      const ids = [...following].filter((id) => id !== uid);
      // Keep each request within Firestore's access-call limit for follow checks.
      for (let index = 0; index < ids.length; index += 8) {
        followedSubscriptions.push(subscribe(`following:${index}`, query(collection(db, "stories"), where("userId", "in", ids.slice(index, index + 8)), orderBy("createdAt", "desc"), limit(50)), generation));
      }
    }, () => {
      generation++; followedSubscriptions.forEach((unsubscribe) => unsubscribe()); followedSubscriptions = [];
      following = new Set();
      for (const key of sources.keys()) if (key.startsWith("following:")) sources.delete(key);
      failures.add("follows"); publish();
    }) : () => {};
    const expiryTimer = window.setInterval(publish, 30_000);
    return () => { active = false; window.clearInterval(expiryTimer); publicSubscription(); ownSubscription(); followSubscription(); followedSubscriptions.forEach((unsubscribe) => unsubscribe()); };
  }, [uid]);
  return result.uid === uid ? result : { uid, stories: [], error: "" };
}
