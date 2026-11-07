import { getPostHogBrowser } from "./posthog";
import type { Post } from "@/src/types";

export type PostMetric = "impression" | "view" | "like" | "unlike" | "watch_time";
const seen = new Set<string>();

export async function capturePostMetric(post: Pick<Post, "id" | "userId" | "mediaType">, viewerId: string | null, type: PostMetric, seconds = 0) {
  if (!viewerId || viewerId === post.userId) return;
  try {
    const ph = await getPostHogBrowser();
    if (!ph) return;
    const key = JSON.stringify([viewerId, post.id, type]);
    if (type === "impression" || type === "view") {
      if (seen.has(key)) return;
      try { if (sessionStorage.getItem(key)) return; } catch { /* storage unavailable */ }
      seen.add(key);
      try { sessionStorage.setItem(key, "1"); } catch { /* in-memory dedupe remains */ }
    }
    ph.capture("post_engaged", {
      schema_version: 2,
      creator_id: post.userId,
      post_id: post.id,
      viewer_id: viewerId,
      media_type: post.mediaType,
      event_type: type,
      watch_seconds: type === "watch_time" ? Math.max(0, seconds) : 0,
      like_delta: type === "like" ? 1 : type === "unlike" ? -1 : 0,
    });
  } catch { /* Analytics must never interrupt posting or playback. */ }
}
