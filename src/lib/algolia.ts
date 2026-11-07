/**
 * Algolia client utilities — compatible with algoliasearch v5.
 *
 * v5 breaking changes vs v4:
 *  - No default export. Use named imports only.
 *  - `algoliasearch(app, key)` → `liteClient(app, key)` from 'algoliasearch/lite'
 *  - Admin operations use `algoliasearch` named export from 'algoliasearch'
 *  - search-insights v3 API is unchanged (still uses aa())
 */
import { liteClient } from "algoliasearch/lite";

const APP_ID     = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID     ?? "";
const SEARCH_KEY = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY ?? "";
export const ALGOLIA_INDEX = process.env.ALGOLIA_INDEX_NAME   ?? "noorfeed_posts";

// ── Browser search client (lite — read-only, smallest bundle) ────────────────
// Safe to use in client components. Uses the public search-only API key.
export const algoliaSearchClient = APP_ID && SEARCH_KEY ? liteClient(APP_ID, SEARCH_KEY) : null;

// Server-side admin utilities live in algolia.server.ts.

// ── Client-side Insights initialisation ──────────────────────────────────────
// Call once after the user signs in to attribute events to their ID.
export async function initAlgoliaInsights(userToken: string): Promise<void> {
  if (typeof window === "undefined" || !APP_ID || !SEARCH_KEY) return;
  try {
    const { default: aa } = await import("search-insights");
    aa("init", {
      appId:     APP_ID,
      apiKey:    SEARCH_KEY,
      userToken,
      useCookie: true,
    });
  } catch { /* non-critical if Algolia keys not yet configured */ }
}

// ── Insight event helpers (fire-and-forget, client-only) ──────────────────────
export async function sendAlgoliaEvent(
  eventName: string,
  eventType: "click" | "conversion",
  objectIDs: string[],
  userToken: string
): Promise<void> {
  if (typeof window === "undefined") return;
  // Skip silently if APP_ID not configured
  if (!APP_ID || !SEARCH_KEY) return;
  try {
    const { default: aa } = await import("search-insights");
    if (eventType === "click") {
      aa("clickedObjectIDs", {
        index:     ALGOLIA_INDEX,
        eventName,
        objectIDs,
        userToken,
      });
    } else {
      aa("convertedObjectIDs", {
        index:     ALGOLIA_INDEX,
        eventName,
        objectIDs,
        userToken,
      });
    }
  } catch { /* non-critical */ }
}
