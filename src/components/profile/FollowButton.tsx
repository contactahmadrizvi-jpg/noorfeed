"use client";

import { useFollow } from "@/src/hooks/useFollow";
import { Loader2 } from "lucide-react";

interface Props {
  targetUid: string;
}

export default function FollowButton({ targetUid }: Props) {
  const { isFollowing, busy, toggle } = useFollow(targetUid);

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`flex min-w-[100px] items-center justify-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold transition disabled:opacity-60 ${
        isFollowing
          ? "border border-slate-200 bg-white text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-500"
          : "bg-emerald-500 text-white hover:bg-emerald-600"
      }`}
    >
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {isFollowing ? "Following" : "Follow"}
    </button>
  );
}
