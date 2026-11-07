import "server-only";

import { PostHog as PostHogNode } from "posthog-node";

let _phServer: PostHogNode | null = null;

export function getPostHogServer(): PostHogNode {
  if (_phServer) return _phServer;
  const key  = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com";
  if (!key) throw new Error("NEXT_PUBLIC_POSTHOG_KEY is not set");
  _phServer = new PostHogNode(key, { host, flushAt: 1, flushInterval: 0 });
  return _phServer;
}
