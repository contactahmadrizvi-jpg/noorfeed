"use client";

import { useState } from "react";
import { useAuth } from "@/src/context/AuthContext";
import PostComposer from "@/src/components/composer/PostComposer";
import AuthModal from "@/src/components/auth/AuthModal";
import { PlusCircle } from "lucide-react";

export default function CreatePage() {
  const { user } = useAuth();
  const [composerOpen, setComposerOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const handleCreate = () => {
    if (!user) { setAuthOpen(true); return; }
    setComposerOpen(true);
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center justify-center gap-6 px-4 py-20 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
        <PlusCircle className="h-10 w-10 text-emerald-500" />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Share with the Ummah</h1>
        <p className="mt-2 text-slate-500">
          Post a reminder, ayah, hadith, or any Islamic content to inspire others.
        </p>
      </div>
      <button
        onClick={handleCreate}
        className="rounded-full bg-emerald-500 px-8 py-3 font-semibold text-white transition hover:bg-emerald-600"
      >
        Create Post
      </button>

      <PostComposer open={composerOpen} onClose={() => setComposerOpen(false)} />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} defaultView="login" />
    </div>
  );
}
