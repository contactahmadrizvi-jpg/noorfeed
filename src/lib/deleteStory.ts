import { doc, runTransaction } from "firebase/firestore";
import { auth, db } from "@/src/lib/firebase";

export async function deleteOwnStory(storyId: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in to delete your story.");
  await runTransaction(db, async (transaction) => {
    const reference = doc(db, "stories", storyId);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) return;
    if (snapshot.data().userId !== uid) throw new Error("You can only delete your own stories.");
    transaction.delete(reference);
  });
}
