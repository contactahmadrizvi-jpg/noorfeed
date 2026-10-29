"use client";
import { usePresenceWriter } from "@/src/hooks/usePresence";

/** Mounts once at root — tracks online/offline status for the signed-in user */
export default function PresenceWriter() {
  usePresenceWriter();
  return null;
}
