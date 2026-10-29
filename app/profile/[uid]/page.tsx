import UserProfileView from "@/src/components/profile/UserProfileView";

interface Props {
  params: Promise<{ uid: string }>;
}

// Next.js 15+ passes params as a Promise — must be awaited in server components.
export default async function ProfilePage({ params }: Props) {
  const { uid } = await params;
  return <UserProfileView uid={uid} />;
}
