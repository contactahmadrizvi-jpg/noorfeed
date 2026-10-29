"use client";
import { useEffect } from "react";
import { useAuth } from "@/src/context/AuthContext";
import { hydrateFeedSignals } from "@/src/lib/feedSignals";

export function useFeedSignals() {
  const { user, profile } = useAuth();
  const uid = user?.uid;
  const remote = profile?.uid === uid ? profile?.feedSignals : undefined;
  useEffect(() => { if (uid) hydrateFeedSignals(uid, remote); }, [uid, remote]);
}
