"use client";

/**
 * PostHogProvider — mounts once at the app root and initialises PostHog
 * as soon as the component hydrates. Tracks route changes automatically
 * using Next.js navigation events.
 */
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getPostHogBrowser } from "@/src/lib/posthog";

export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  // Initialise PostHog on first mount
  useEffect(() => {
    getPostHogBrowser(); // lazy init — sets up autocapture, session recording etc.
  }, []);

  // Track page views on every route change
  useEffect(() => {
    const url = `${pathname}${searchParams.toString() ? "?" + searchParams.toString() : ""}`;
    getPostHogBrowser().then((ph) => ph?.capture("$pageview", { $current_url: url }));
  }, [pathname, searchParams]);

  return <>{children}</>;
}
