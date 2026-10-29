"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { ArrowLeft, Globe, Loader2, Users } from "lucide-react";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/context/AuthContext";
import { StoryAudience } from "@/src/types";

export default function SettingsPage() {
  const { user, loading, requireAuth, refreshProfile } = useAuth();
  return <div className="mx-auto max-w-xl px-4 pb-24 pt-5">
    <div className="mb-6 flex items-center gap-3"><Link href="/" aria-label="Back to home" className="rounded-full p-2 text-slate-500 hover:bg-slate-50"><ArrowLeft className="h-5 w-5" /></Link><h1 className="text-xl font-bold">Settings</h1></div>
    {loading ? <p role="status" className="text-sm text-slate-500">Loading settings…</p> : !user ? <div className="rounded-2xl border border-slate-100 p-6 text-center"><p className="text-slate-600">Sign in to manage your story settings.</p><button onClick={requireAuth} className="mt-4 rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white">Sign in</button></div>
      : <><Link href="/settings/profile" className="mb-5 flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-5 text-sm font-semibold shadow-sm hover:bg-slate-50"><span>Edit profile<span className="mt-1 block text-xs font-normal text-slate-500">Photo, name, username, bio and interests</span></span><span aria-hidden="true">→</span></Link><StorySettings key={user.uid} uid={user.uid} onSaved={refreshProfile} /></>}
  </div>;
}

function StorySettings({ uid, onSaved }: { uid: string; onSaved: () => Promise<void> }) {
  const [saved, setSaved] = useState<StoryAudience | null>(null);
  const [choice, setChoice] = useState<StoryAudience | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  useEffect(() => onSnapshot(doc(db, "users", uid), (snap) => {
    if (!snap.exists()) { setError("Your profile is not available yet."); return; }
    setSaved(snap.data().storyAudience === "followers" ? "followers" : "public");
    setError("");
  }, () => setError("Could not load your settings. Please try again.")), [uid, retry]);
  const selected = choice ?? saved;
  async function save() {
    if (!selected || lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await updateDoc(doc(db, "users", uid), { storyAudience: selected });
      setSaved(selected); setChoice(null); setNotice("Story audience saved.");
      await onSaved();
    } catch { setError("Could not save your settings. Please try again."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
    <h2 className="text-lg font-bold">Story privacy</h2>
    <p className="mt-2 text-sm leading-relaxed text-slate-500">Choose who can see the stories you upload after saving. Existing stories keep their original audience.</p>
    <fieldset disabled={busy || saved === null} className="mt-5 space-y-3"><legend className="mb-3 text-sm font-semibold">Who can see my new stories?</legend>
      {([{ value: "public", title: "Public", description: "Anyone can view your stories, including people who do not follow you.", Icon: Globe }, { value: "followers", title: "Followers only", description: "Only people who follow you can view your stories. You can always see your own.", Icon: Users }] as const).map(({ value, title, description, Icon }) => <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${selected === value ? "border-emerald-500 bg-emerald-50" : "border-slate-100 hover:bg-slate-50"}`}>
        <input type="radio" name="story-audience" value={value} checked={selected === value} onChange={() => { setChoice(value); setNotice(""); }} className="mt-1 accent-emerald-600" />
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><span><span className="block text-sm font-semibold">{title}</span><span className="mt-1 block text-sm leading-relaxed text-slate-500">{description}</span></span>
      </label>)}
    </fieldset>
    {saved === null && !error && <p role="status" className="mt-3 text-sm text-slate-500">Loading your preference…</p>}
    {error && <p role="alert" className="mt-4 text-sm text-red-600">{error} {saved === null && <button onClick={() => setRetry((n) => n + 1)} className="underline">Retry</button>}</p>}
    {notice && <p role="status" className="mt-4 text-sm font-medium text-emerald-700">{notice}</p>}
    <button onClick={() => void save()} disabled={busy || saved === null || selected === saved} className="mt-5 flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save changes</button>
  </section>;
}
