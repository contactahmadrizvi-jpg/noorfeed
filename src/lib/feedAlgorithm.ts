import { ISLAMIC_CATEGORIES, IslamicCategory, Post, UserProfile } from "@/src/types";
import { FeedSignals, interestValue } from "./feedLearning";

export function categoryInterest(category: IslamicCategory, profile: UserProfile | null, signals?: FeedSignals, now = Date.now()) {
  return Math.max(0, (profile?.interests?.includes(category) ? 6 : 0) + interestValue(signals?.categories[category], now));
}
export function preferredCategories(profile: UserProfile | null, signals?: FeedSignals, now = Date.now()) {
  return ISLAMIC_CATEGORIES.map((category) => ({ category, score: categoryInterest(category, profile, signals, now) }))
    .filter((entry) => entry.score >= 2).sort((a, b) => b.score - a.score).slice(0, 3).map((entry) => entry.category);
}
export function isPreferred(post: Post, profile: UserProfile | null, following: ReadonlySet<string>, signals?: FeedSignals, now = Date.now()) {
  return categoryInterest(post.category, profile, signals, now) >= 2 || following.has(post.userId)
    || interestValue(signals?.authors[post.userId], now) >= 4;
}
export function scorePost(post: Post, profile: UserProfile | null, following: ReadonlySet<string>, signals?: FeedSignals, now = Date.now()) {
  const age = Math.max(0, now - (post.createdAt?.toMillis?.() ?? now)) / 3_600_000;
  const engagement = Math.max(0, (post.viewsCount ?? 0) * 0.1 + (post.likesCount ?? 0) + (post.savesCount ?? 0) * 5 + (post.sharesCount ?? 0) * 5);
  const affinity = categoryInterest(post.category, profile, signals, now);
  const author = Math.max(-5, Math.min(10, interestValue(signals?.authors[post.userId], now)));
  const freshness = 8 / Math.pow(1 + age / 12, 0.7);
  // Log engagement prevents popularity from overwhelming a person's interests.
  let score = 1 + affinity * 4 + author * 2 + (following.has(post.userId) ? 8 : 0) + freshness + Math.min(12, Math.log1p(engagement) * 1.5);
  if (signals?.seen[post.id] && now - signals.seen[post.id] < 7 * 86_400_000) score *= 0.15;
  if (signals?.actions[`${post.id}:report`]?.enabled) return -Infinity;
  return score;
}
export function sortFeed(posts: Post[], profile: UserProfile | null, following: ReadonlySet<string>, signals?: FeedSignals, now = Date.now()): Post[] {
  return [...new Map(posts.map((post) => [post.id, post])).values()]
    .filter((post) => post.isApproved && (post.reportsCount ?? 0) < 5 && !signals?.actions[`${post.id}:report`]?.enabled)
    .sort((a, b) => scorePost(b, profile, following, signals, now) - scorePost(a, profile, following, signals, now) || (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0) || a.id.localeCompare(b.id));
}

/** Three interest/followed posts, then one discovery post when both are available. */
export function selectFeedPage(posts: Post[], profile: UserProfile | null, following: ReadonlySet<string>, signals?: FeedSignals, size = 12, now = Date.now(), offset = 0) {
  const ranked = sortFeed(posts, profile, following, signals, now);
  const preferred = ranked.filter((post) => isPreferred(post, profile, following, signals, now));
  const discovery = ranked.filter((post) => !isPreferred(post, profile, following, signals, now));
  const selected: Post[] = [];
  const take = (pool: Post[]) => {
    const last = selected.at(-1);
    const penultimate = selected.at(-2);
    const different = last && penultimate?.userId === last.userId ? pool.findIndex((post) => post.userId !== last.userId) : 0;
    return pool.splice(different < 0 ? 0 : different, 1)[0];
  };
  while (selected.length < size && (preferred.length || discovery.length)) {
    const explore = (offset + selected.length + 1) % 4 === 0;
    const primary = explore ? discovery : preferred;
    selected.push(take(primary.length ? primary : explore ? preferred : discovery));
  }
  return selected;
}
