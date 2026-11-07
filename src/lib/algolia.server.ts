import "server-only";
import { algoliasearch } from "algoliasearch";

const APP_ID = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID ?? "";

export function getAlgoliaAdminClient() {
  const adminKey = process.env.ALGOLIA_ADMIN_KEY;
  if (!adminKey) throw new Error("ALGOLIA_ADMIN_KEY is not set.");
  return algoliasearch(APP_ID, adminKey);
}
