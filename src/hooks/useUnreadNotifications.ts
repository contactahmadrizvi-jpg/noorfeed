"use client";

import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/context/AuthContext";

/** Returns the live count of unread notifications for the current user. */
export function useUnreadNotifications(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) { setCount(0); return; }

    const q = query(
      collection(db, "notifications"),
      where("toUserId", "==", user.uid),
      where("read", "==", false)
    );

    const unsub = onSnapshot(q, (snap) => {
      setCount(snap.size);
    });

    return () => unsub();
  }, [user]);

  return count;
}
