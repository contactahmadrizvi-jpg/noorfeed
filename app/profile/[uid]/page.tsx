import UserProfileView from "@/src/components/profile/UserProfileView";

// Force this to be a static shell — no server-side work, no awaiting params.
// The client component handles all data fetching directly from Firestore.
export default function ProfilePage({
  params,
}: {
  params: { uid: string };
}) {
  return <UserProfileView uid={params.uid} />;
}
