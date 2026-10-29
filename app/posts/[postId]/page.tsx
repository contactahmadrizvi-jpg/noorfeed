import PostDetail from "@/src/components/feed/PostDetail";

export default async function PostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  return <PostDetail key={postId} postId={postId} />;
}
