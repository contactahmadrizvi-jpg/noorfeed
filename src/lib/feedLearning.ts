import { IslamicCategory, Post } from "@/src/types";

export type FeedAction = "view" | "like" | "save" | "share" | "comment" | "report";
export interface InterestSignal { score: number; updatedAt: number }
export interface FeedSignals {
  categories: Partial<Record<IslamicCategory, InterestSignal>>;
  authors: Record<string, InterestSignal>;
  actions: Record<string, { enabled: boolean; updatedAt: number }>;
  seen: Record<string, number>;
  updatedAt: number;
}
export const emptyFeedSignals = (): FeedSignals => ({ categories: {}, authors: {}, actions: {}, seen: {}, updatedAt: 0 });
const WEIGHTS: Record<FeedAction, number> = { view: 1, like: 4, save: 7, share: 8, comment: 5, report: -12 };
const DAY = 86_400_000;
export function interestValue(signal: InterestSignal | undefined, now: number) {
  if (!signal || !Number.isFinite(signal.score) || !Number.isFinite(signal.updatedAt)) return 0;
  return signal.score * Math.pow(0.5, Math.max(0, now - signal.updatedAt) / (14 * DAY));
}
export function applyFeedAction(previous: FeedSignals, post: Post, action: FeedAction, now: number, enabled = true): FeedSignals {
  const daily = action === "view" || action === "share" || action === "comment";
  const key = `${post.id}:${action}${daily ? `:${Math.floor(now / DAY)}` : ""}`;
  const old = previous.actions[key];
  if (old?.enabled === enabled) return previous;
  // An undo can remove only an interest contribution this account actually recorded.
  const delta = enabled ? WEIGHTS[action] : old ? -WEIGHTS[action] * Math.pow(0.5, Math.max(0, now - old.updatedAt) / (14 * DAY)) : 0;
  const retain = <T extends { updatedAt: number }>(values: Record<string, T>, count: number) => Object.fromEntries(Object.entries(values).sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, count));
  const categories = { ...previous.categories, [post.category]: { score: Math.max(-30, Math.min(100, interestValue(previous.categories[post.category], now) + delta)), updatedAt: now } };
  const authors = retain({ ...previous.authors, [post.userId]: { score: Math.max(-30, Math.min(60, interestValue(previous.authors[post.userId], now) + delta)), updatedAt: now } }, 200);
  const seen = action === "view" ? Object.fromEntries(Object.entries({ ...previous.seen, [post.id]: now }).sort((a, b) => b[1] - a[1]).slice(0, 300)) : previous.seen;
  return { categories, authors, seen, actions: retain({ ...previous.actions, [key]: { enabled, updatedAt: now } }, 1000), updatedAt: now };
}
