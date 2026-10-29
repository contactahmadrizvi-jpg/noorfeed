import { collection, getDocs, limit, orderBy, query, startAfter, where, QueryConstraint, QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { Post, UserProfile } from "@/src/types";
import { FeedSignals } from "./feedLearning";
import { isPreferred, preferredCategories, selectFeedPage } from "./feedAlgorithm";

export interface FeedContext { profile: UserProfile | null; following: ReadonlySet<string>; signals?: FeedSignals }
interface Source { constraints: QueryConstraint[]; cursor: QueryDocumentSnapshot<DocumentData> | null; done: boolean; size: number }
export class RecommendationFeed {
  private sources = new Map<string, Source>();
  private candidates = new Map<string, Post>();
  private delivered = new Set<string>();
  private busy = false;
  private activeKeys: string[] = [];
  constructor(exclude: string[] = []) { exclude.forEach((id) => this.delivered.add(id)); }
  exclude(id: string) { this.delivered.add(id); this.candidates.delete(id); }
  private configure(context: FeedContext) {
    const add = (key: string, constraints: QueryConstraint[], size: number) => {
      if (!this.sources.has(key)) this.sources.set(key, { constraints, cursor: null, done: false, size });
      return key;
    };
    const keys = [add("recent", [], 36)];
    const categories = preferredCategories(context.profile, context.signals).sort();
    if (categories.length) keys.push(add(`interests:${categories.join(",")}`, [where("category", "in", categories)], 24));
    const authors = [...context.following].sort().slice(0, 30);
    for (let index = 0; index < authors.length; index += 10) {
      const group = authors.slice(index, index + 10);
      keys.push(add(`authors:${group.join(",")}`, [where("userId", "in", group)], 12));
    }
    this.activeKeys = keys;
    for (const key of this.sources.keys()) if (!keys.includes(key)) this.sources.delete(key);
  }
  async next(context: FeedContext, size = 12) {
    if (this.busy) return { posts: [] as Post[], hasMore: true, partial: false };
    this.busy = true;
    try {
      this.configure(context);
      const pool = [...this.candidates.values()];
      const preferred = pool.filter((post) => isPreferred(post, context.profile, context.following, context.signals)).length;
      let partial = false;
      if (pool.length < size * 2 || preferred < size * 0.75 || pool.length - preferred < size * 0.25) {
        const pending = this.activeKeys.filter((key) => !this.sources.get(key)!.done);
        const reads = await Promise.allSettled(pending.map(async (key) => {
          const source = this.sources.get(key)!;
          const request = query(collection(db, "posts"), where("isApproved", "==", true), ...source.constraints, orderBy("createdAt", "desc"), ...(source.cursor ? [startAfter(source.cursor)] : []), limit(source.size));
          const result = await getDocs(request);
          source.cursor = result.docs.at(-1) ?? source.cursor;
          source.done = result.size < source.size;
          for (const item of result.docs) {
            const post = { ...item.data(), id: item.id } as Post;
            if (!this.delivered.has(post.id) && post.isApproved && (post.reportsCount ?? 0) < 5) this.candidates.set(post.id, post);
          }
        }));
        reads.forEach((result, index) => {
          if (result.status === "rejected" && pending[index] !== "recent") { this.sources.get(pending[index])!.done = true; partial = true; }
        });
        const recent = pending.indexOf("recent");
        if (recent >= 0 && reads[recent].status === "rejected" && !this.candidates.size) throw new Error("Could not load your feed. Please try again.");
      }
      const selected = selectFeedPage([...this.candidates.values()], context.profile, context.following, context.signals, size, Date.now(), this.delivered.size);
      for (const post of selected) { this.delivered.add(post.id); this.candidates.delete(post.id); }
      for (const post of this.candidates.values()) if (context.signals?.actions[`${post.id}:report`]?.enabled) this.candidates.delete(post.id);
      return { posts: selected, hasMore: this.candidates.size > 0 || this.activeKeys.some((key) => !this.sources.get(key)!.done), partial };
    } finally { this.busy = false; }
  }
}
