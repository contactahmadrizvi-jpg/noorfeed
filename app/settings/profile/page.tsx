"use client";

import Link from "next/link";
import { useAuth } from "@/src/context/AuthContext";
import EditProfileForm from "@/src/components/profile/EditProfileForm";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function EditProfilePage() {
  const { user, profile, loading, requireAuth, refreshProfile } = useAuth();
  return <div className="mx-auto max-w-xl px-4 pb-24 pt-5">
    <div className="mb-6 flex items-center gap-3"><Link href={user ? `/profile/${user.uid}` : "/"} aria-label="Back to profile" className="rounded-full p-2 text-slate-500 hover:bg-slate-50"><ArrowLeft className="h-5 w-5" /></Link><h1 className="text-xl font-bold">Edit profile</h1></div>
    {loading ? <div role="status" className="flex justify-center py-12"><Loader2 aria-label="Loading profile" className="h-6 w-6 animate-spin text-emerald-500" /></div>
      : !user ? <div className="rounded-2xl border border-slate-100 p-6 text-center"><p>Sign in to edit your profile.</p><button onClick={requireAuth} className="mt-4 rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white">Sign in</button></div>
      : !profile || profile.uid !== user.uid ? <div role="status" className="rounded-2xl border border-slate-100 p-6 text-center text-sm text-slate-500"><p>Loading your profile…</p><button onClick={() => void refreshProfile()} className="mt-3 font-semibold text-emerald-600 underline">Retry</button></div>
      : <EditProfileForm key={user.uid} profile={profile} />}
  </div>;
}
