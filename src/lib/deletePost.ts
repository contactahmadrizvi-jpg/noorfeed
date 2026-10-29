import { doc, runTransaction } from "firebase/firestore";
import { auth, db } from "@/src/lib/firebase";

export async function deleteOwnPost(postId: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in to delete your post.");
  await runTransaction(db, async (transaction) => {
    const reference = doc(db, "posts", postId);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) return;
    if (snapshot.data().userId !== uid) throw new Error("You can only delete your own posts.");
    transaction.delete(reference);
  });
}
