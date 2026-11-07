/**
 * PostHog utilities.
 * Browser: lazy-initialised singleton via posthog-js.
 * Server utilities live in posthog.server.ts.
 */

// ── Browser client ────────────────────────────────────────────────────────────
import type { PostHog as PostHogBrowser } from "posthog-js";

let _phBrowser: PostHogBrowser | null = null;
let browserInit: Promise<PostHogBrowser> | null = null;

export async function getPostHogBrowser(): Promise<PostHogBrowser | null> {
  if (typeof window === "undefined") return null;
  if (_phBrowser) return _phBrowser;

  const key  = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com";
  if (!key) return null;

  if (!browserInit) {
    browserInit = import("posthog-js").then(({ default: posthog }) => {
      if (!posthog.__loaded) posthog.init(key, {
        api_host: host,
        capture_pageview: false,
        capture_pageleave: true,
        persistence: "localStorage",
        autocapture: false,
        disable_session_recording: false,
      });
      _phBrowser = posthog;
      return posthog;
    }).catch((error) => {
      browserInit = null;
      throw error;
    });
  }
  return browserInit;
}

/** Track a named event. Call from client components only. */
export async function trackEvent(
  event: string,
  properties?: Record<string, unknown>
): Promise<void> {
  const ph = await getPostHogBrowser();
  ph?.capture(event, properties);
}

/** Identify a signed-in user so events are attributed to their account. */
export async function identifyUser(
  uid: string,
  traits?: Record<string, unknown>
): Promise<void> {
  const ph = await getPostHogBrowser();
  ph?.identify(uid, traits);
}

/** Reset PostHog on sign-out. */
export async function resetPostHog(): Promise<void> {
  const ph = await getPostHogBrowser();
  ph?.reset();
}

