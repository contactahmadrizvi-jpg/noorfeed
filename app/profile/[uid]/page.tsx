import UserProfileView from "@/src/components/profile/UserProfileView";

interface Props {
  params: Promise<{ uid: string }>;
}

export default async function ProfilePage({ params }: Props) {
  const { uid } = await params;
  return <UserProfileView uid={uid} />;
}
