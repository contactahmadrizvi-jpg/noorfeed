import { collection, doc, getDocs, query, runTransaction, where } from "firebase/firestore";
import { auth, db } from "@/src/lib/firebase";
import { ISLAMIC_CATEGORIES, IslamicCategory } from "@/src/types";
import { validateBio, validateDisplayName, validateUsername } from "./validators";

export interface ProfileEdits { username: string; displayName: string; bio: string; avatarUrl: string; interests: IslamicCategory[] }
export function validateProfileEdits(input: ProfileEdits) {
  const username = input.username.trim().toLowerCase();
  const error = validateUsername(username) || validateDisplayName(input.displayName) || validateBio(input.bio);
  if (error) throw new Error(error);
  const interests = [...new Set(input.interests)];
  if (interests.length < 3 || interests.some((category) => !ISLAMIC_CATEGORIES.includes(category))) throw new Error("Choose at least 3 interests from the list.");
  if (input.avatarUrl && !input.avatarUrl.startsWith("https://")) throw new Error("Please upload a valid profile image.");
  return { username, displayName: input.displayName.trim(), bio: input.bio.trim(), avatarUrl: input.avatarUrl, interests };
}

export async function saveProfileEdits(uid: string, input: ProfileEdits) {
  if (auth.currentUser?.uid !== uid) throw new Error("Sign in to edit your own profile.");
  const updates = validateProfileEdits(input);
  const matches = await getDocs(query(collection(db, "users"), where("username", "==", updates.username)));
  if (matches.docs.some((item) => item.id !== uid)) throw new Error(`@${updates.username} is already taken. Choose another username.`);
  await runTransaction(db, async (transaction) => {
    const reference = doc(db, "users", uid);
    const current = await transaction.get(reference);
    if (!current.exists()) throw new Error("Your profile could not be found. Please try again.");
    if (auth.currentUser?.uid !== uid) throw new Error("Your session changed. Sign in and try again.");
    // Update only editable fields; preserve counters, privacy settings and learned interests.
    transaction.update(reference, updates);
  });
  return updates;
}
