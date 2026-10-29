import { Timestamp } from "firebase/firestore";

export type IslamicCategory =
  | "Quran"
  | "Hadith"
  | "Daily Duas"
  | "Seerah"
  | "Fiqh"
  | "Short Reminders"
  | "Scholar Lectures";

export const ISLAMIC_CATEGORIES: IslamicCategory[] = [
  "Quran",
  "Hadith",
  "Daily Duas",
  "Seerah",
  "Fiqh",
  "Short Reminders",
  "Scholar Lectures",
];

export interface UserProfile {
  uid: string;
  email: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  interests: IslamicCategory[];
  followersCount: number;
  followingCount: number;
  createdAt: Timestamp | null;
}

export interface Post {
  id: string;
  userId: string;
  username: string;
  userAvatar: string;
  title: string;
  caption: string;
  category: IslamicCategory;
  mediaUrl: string;
  mediaType: "image" | "video" | "text";
  likesCount: number;
  savesCount: number;
  sharesCount: number;
  reportsCount: number;
  /** Total unique views (incremented once per user per session) */
  viewsCount: number;
  isApproved: boolean;
  createdAt: Timestamp | null;
}

export interface Story {
  id: string;
  userId: string;
  username: string;
  userAvatar: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  /** Display duration in seconds — between 1 and 60 */
  duration: number;
  /** UIDs of users (excluding the owner) who have viewed this story */
  viewedBy: string[];
  /** Count of unique non-owner views */
  viewsCount: number;
  /** UIDs of users who liked this story */
  likedBy: string[];
  /** Total like count */
  likesCount: number;
  expiresAt: number;
  createdAt: Timestamp | null;
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  username: string;
  userAvatar: string;
  text: string;
  /** emoji → array of UIDs who reacted with it */
  reactions: Record<string, string[]>;
  /** id of parent comment if this is a reply */
  replyTo: string | null;
  /** username of the person being replied to */
  replyToUsername: string | null;
  createdAt: Timestamp | null;
}

export interface FollowRelationship {
  id: string;
  followerId: string;
  followingId: string;
  timestamp: Timestamp | null;
}

export interface Notification {
  id: string;
  toUserId: string;
  fromUserId: string;
  fromUsername: string;
  fromAvatar: string;
  type: "follow" | "like" | "comment" | "share" | "story_like";
  postId?: string;
  postThumb?: string;
  read: boolean;
  createdAt: Timestamp | null;
}
