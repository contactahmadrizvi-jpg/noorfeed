"use client";

import { useEffect, useState } from "react";
import { deleteField, doc, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/context/AuthContext";
import { PresenceRecord, presenceStatus } from "@/src/lib/presenceStatus";

/** Each visible tab owns a short-lived session, so closing one tab keeps others online. */
export function usePresenceWriter() {
  const { user } = useAuth();
  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    const reference = doc(db, "users", uid, "presence", "status");
    const session = crypto.randomUUID();
    const write = (online: boolean) => {
      void setDoc(reference, {
        online, lastSeen: serverTimestamp(),
        sessions: { [session]: online ? serverTimestamp() : deleteField() },
      }, { merge: true }).catch(() => { /* A stale session expires if the network or page closes. */ });
    };
    const refresh = () => write(document.visibilityState === "visible" && navigator.onLine);
    const hide = () => write(false);
    refresh();
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) write(true);
    }, 30_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", hide);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", hide);
      hide();
    };
  }, [uid]);
}

export function usePresenceStatus(uid: string | null) {
  const [snapshot, setSnapshot] = useState<{ uid: string; presence: PresenceRecord | null } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 15_000);
    window.addEventListener("focus", tick);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", tick); };
  }, []);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "users", uid, "presence", "status"), (snap) => {
      setSnapshot({ uid, presence: snap.exists() ? snap.data() as PresenceRecord : null });
      setNow(Date.now());
    }, () => setSnapshot({ uid, presence: null }));
  }, [uid]);
  if (!uid || snapshot?.uid !== uid || !now) return { online: false, label: "Checking status…", presence: null };
  return { ...presenceStatus(snapshot.presence, now), presence: snapshot.presence };
}

/** Keep the original API available to pages already loaded before a hot update. */
export function useUserPresence(uid: string | null): PresenceRecord | null {
  const status = usePresenceStatus(uid);
  return status.presence ? { ...status.presence, online: status.online } : null;
}

export function formatLastSeen(presence: PresenceRecord | null): string {
  return presenceStatus(presence, Date.now()).label;
}
