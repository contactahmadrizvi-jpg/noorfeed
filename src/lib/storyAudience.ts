import { Story } from "@/src/types";

export function canViewStory(story: Story, viewerId: string | null, following: ReadonlySet<string>) {
  return story.audience === "public" || (!!viewerId && (story.userId === viewerId || following.has(story.userId)));
}
