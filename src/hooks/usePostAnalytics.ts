"use client";

import { useEffect, type RefObject } from "react";
import type { Post } from "@/src/types";
import { capturePostMetric } from "@/src/lib/postAnalytics";

/** Signed-in audience only. Paused, buffering, seeking and hidden-tab time are excluded. */
export function usePostAnalytics(ref: RefObject<HTMLElement | null>, post: Post, viewerId: string | null) {
  const { id, userId, mediaType } = post;
  useEffect(() => {
    const card = ref.current;
    if (!card || !viewerId || viewerId === userId) return;
    const metricPost = { id, userId, mediaType };
    let inView = false;
    let visibleMs = 0;
    let watchedMs = 0;
    let pendingWatchMs = 0;
    let lastTick = performance.now();
    let lastFlush = lastTick;
    let impression = false;
    let viewed = false;
    const emit = (type: "impression" | "view" | "watch_time", seconds = 0) => {
      void capturePostMetric(metricPost, viewerId, type, seconds);
    };
    const flush = () => {
      if (pendingWatchMs > 0) { emit("watch_time", pendingWatchMs / 1000); pendingWatchMs = 0; }
      lastFlush = performance.now();
    };
    const sample = () => {
      const now = performance.now();
      const elapsed = Math.min(1000, Math.max(0, now - lastTick));
      lastTick = now;
      if (inView && document.visibilityState === "visible") {
        visibleMs += elapsed;
        if (!impression && visibleMs >= 1000) { impression = true; emit("impression"); }
        const video = card.querySelector("video");
        if (mediaType === "video" && video && !video.paused && !video.ended && !video.seeking && video.readyState >= 3) {
          watchedMs += elapsed;
          pendingWatchMs += elapsed;
        }
        if (!viewed && (mediaType === "video" ? watchedMs : visibleMs) >= 2000) { viewed = true; emit("view"); }
      }
      if (now - lastFlush >= 10000) flush();
    };
    const observer = new IntersectionObserver(([entry]) => {
      sample();
      inView = entry.isIntersecting && entry.intersectionRatio >= 0.5;
      if (!inView) { visibleMs = 0; flush(); }
    }, { threshold: [0, 0.5] });
    const onVisibility = () => { sample(); if (document.visibilityState !== "visible") { visibleMs = 0; flush(); } };
    const onPageHide = () => { sample(); flush(); };
    observer.observe(card);
    const timer = window.setInterval(sample, 250);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      sample(); flush(); observer.disconnect(); window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [ref, id, userId, mediaType, viewerId]);
}
