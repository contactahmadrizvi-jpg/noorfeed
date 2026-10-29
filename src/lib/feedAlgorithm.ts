import { Post, UserProfile } from "@/src/types";

/**
 * Engagement scoring:
 *   views   × 0.1  (passive signal — low weight)
 *   likes   × 1
 *   saves   × 5    (strongest intent signal)
 *   shares  × 5
 *
 * Divided by hours since creation (+1 to avoid division by zero).
 * Personalization boosts applied on top.
 */
export function scorePost(
  post: Post,
  profile: UserProfile | null,
  followingCache: Set<string>
): number {
  const createdMs = post.createdAt?.toMillis ? post.createdAt.toMillis() : Date.now();
  const hoursPassed = (Date.now() - createdMs) / (1000 * 60 * 60);

  const engagement =
    (post.viewsCount ?? 0) * 0.1 +
    post.likesCount * 1 +
    post.savesCount * 5 +
    post.sharesCount * 5;

  let score = engagement / (hoursPassed + 1);

  // +50% boost if the post matches user's declared interests
  if (profile?.interests?.includes(post.category)) {
    score *= 1.5;
  }

  // +30% boost if the author is followed by the current user
  if (followingCache.has(post.userId)) {
    score *= 1.3;
  }

  return score;
}

export function sortFeed(
  posts: Post[],
  profile: UserProfile | null,
  followingCache: Set<string>
): Post[] {
  return [...posts]
    .filter((p) => p.isApproved && p.reportsCount < 5)
    .sort(
      (a, b) =>
        scorePost(b, profile, followingCache) -
        scorePost(a, profile, followingCache)
    );
}
