"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/context/AuthContext";

/** Returns total count of unread messages across all conversations */
export function useUnreadMessages(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) { setCount(0); return; }

    // Listen to all conversations where this user is a participant
    const q = query(
      collection(db, "conversations"),
      where("participantIds", "array-contains", user.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      let total = 0;
      snap.docs.forEach((d) => {
        const unreadCounts = d.data().unreadCounts as Record<string, number> | undefined;
        total += unreadCounts?.[user.uid] ?? 0;
      });
      setCount(total);
    });

    return () => unsub();
  }, [user]);

  return count;
}
