import { collection, doc, increment, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { Post, UserProfile } from "@/src/types";
import { recordFeedSignal } from "./feedSignals";

/** Validate fresh follow documents and commit the message and counters together. */
export async function sharePostToConversation(sender: UserProfile, recipient: UserProfile, post: Post) {
  if (sender.uid === recipient.uid) throw new Error("Choose another user to share with.");
  const cid = [sender.uid, recipient.uid].sort().join("_");
  const conversation = doc(db, "conversations", cid);
  const message = doc(collection(conversation, "messages"));
  await runTransaction(db, async (transaction) => {
    const outgoing = await transaction.get(doc(db, "follows", `${sender.uid}_${recipient.uid}`));
    const incoming = await transaction.get(doc(db, "follows", `${recipient.uid}_${sender.uid}`));
    const existing = await transaction.get(conversation);
    const currentPost = await transaction.get(doc(db, "posts", post.id));
    if (!outgoing.exists() || !incoming.exists()) {
      throw new Error("You must follow each other to share posts. Refresh the list and try again.");
    }
    if (!currentPost.exists()) throw new Error("This post is no longer available.");
    const sharedPost = currentPost.data() as Post;
    if (existing.exists()) {
      const ids = existing.data().participantIds as string[];
      if (ids.length !== 2 || !ids.includes(sender.uid) || !ids.includes(recipient.uid)) {
        throw new Error("This conversation is unavailable.");
      }
      transaction.update(conversation, {
        lastMessage: "📎 Shared a post", lastMessageAt: serverTimestamp(), lastSenderId: sender.uid,
        [`unreadCounts.${recipient.uid}`]: increment(1),
      });
    } else {
      const info = (user: UserProfile) => ({ username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl });
      transaction.set(conversation, {
        participantIds: [sender.uid, recipient.uid].sort(),
        participants: { [sender.uid]: info(sender), [recipient.uid]: info(recipient) },
        lastMessage: "📎 Shared a post", lastMessageAt: serverTimestamp(), lastSenderId: sender.uid,
        unreadCounts: { [sender.uid]: 0, [recipient.uid]: 1 },
      });
    }
    transaction.set(message, {
      conversationId: cid, senderId: sender.uid, type: "post", text: "", postId: post.id,
      postSnapshot: { title: sharedPost.title, mediaUrl: sharedPost.mediaUrl, mediaType: sharedPost.mediaType, username: sharedPost.username },
      reactions: {}, readBy: [sender.uid], createdAt: serverTimestamp(),
    });
    transaction.update(doc(db, "posts", post.id), { sharesCount: increment(1) });
  });
  recordFeedSignal(sender.uid, post, "share");
  return cid;
}
