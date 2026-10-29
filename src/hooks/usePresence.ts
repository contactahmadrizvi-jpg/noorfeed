"use client";

import { useEffect } from "react";
import { doc, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/context/AuthContext";
import { useState } from "react";
import { UserPresence } from "@/src/types";

/** Call once at app root — writes online=true on mount, online=false + lastSeen on unload */
export function usePresenceWriter() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const ref = doc(db, "users", user.uid, "presence", "status");

    // Mark online
    setDoc(ref, { online: true, lastSeen: serverTimestamp() }, { merge: true });

    // Mark offline on tab close / navigate away
    const handleUnload = () => {
      // navigator.sendBeacon can't write to Firestore, so we use a synchronous
      // best-effort setDoc. This fires reliably on page-hide events.
      setDoc(ref, { online: false, lastSeen: serverTimestamp() }, { merge: true });
    };

    window.addEventListener("beforeunload", handleUnload);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") handleUnload();
      else setDoc(ref, { online: true, lastSeen: serverTimestamp() }, { merge: true });
    });

    return () => {
      handleUnload();
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [user]);
}

/** Read another user's presence in real-time */
export function useUserPresence(uid: string | null): UserPresence | null {
  const [presence, setPresence] = useState<UserPresence | null>(null);

  useEffect(() => {
    if (!uid) return;
    const ref = doc(db, "users", uid, "presence", "status");
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setPresence(snap.data() as UserPresence);
      } else {
        setPresence(null);
      }
    });
    return () => unsub();
  }, [uid]);

  return presence;
}

/** Format lastSeen timestamp into human-readable string */
export function formatLastSeen(presence: UserPresence | null): string {
  if (!presence) return "";
  if (presence.online) return "Online";
  if (!presence.lastSeen) return "Offline";
  const ms = presence.lastSeen.toMillis ? presence.lastSeen.toMillis() : 0;
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
