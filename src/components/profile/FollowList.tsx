"use client";

import { useRouter } from "next/navigation";
import { useFollowersList, useFollowingList } from "@/src/hooks/useFollow";
import { useAuth } from "@/src/context/AuthContext";
import FollowButton from "./FollowButton";
import { Loader2, Users } from "lucide-react";

interface Props {
  profileUid: string;
  mode: "followers" | "following";
}

export default function FollowList({ profileUid, mode }: Props) {
  const router = useRouter();
  const { user } = useAuth();

  // Use the appropriate real-time hook based on mode
  const followers = useFollowersList(profileUid);
  const following = useFollowingList(profileUid);

  const { users, loading } =
    mode === "followers" ? followers : following;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-14 text-center">
        <Users className="h-10 w-10 text-slate-200" />
        <p className="text-sm text-slate-400">
          {mode === "followers"
            ? "No followers yet."
            : "Not following anyone yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {users.map((u) => (
        <div
          key={u.uid}
          className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50"
        >
          {/* Avatar + name — tappable to visit profile */}
          <button
            onClick={() => router.push(`/profile/${u.uid}`)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            {u.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={u.avatarUrl}
                alt={u.displayName}
                className="h-10 w-10 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-600">
                {u.displayName[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {u.displayName}
              </p>
              <p className="truncate text-xs text-slate-500">@{u.username}</p>
            </div>
          </button>

          {/* Follow / unfollow — hide for own uid */}
          {user && user.uid !== u.uid && (
            <FollowButton targetUid={u.uid} />
          )}
        </div>
      ))}
    </div>
  );
}
