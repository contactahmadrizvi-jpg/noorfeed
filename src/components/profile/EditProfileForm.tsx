"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import { ISLAMIC_CATEGORIES, IslamicCategory, UserProfile } from "@/src/types";
import { uploadToCloudinary } from "@/src/lib/cloudinary";
import { validateAvatarFile } from "@/src/lib/validators";
import { saveProfileEdits, validateProfileEdits } from "@/src/lib/editProfile";

export default function EditProfileForm({ profile }: { profile: UserProfile }) {
  const { refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio);
  const [interests, setInterests] = useState<IslamicCategory[]>(profile.interests ?? []);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState(profile.avatarUrl);
  const [savedAvatar, setSavedAvatar] = useState(profile.avatarUrl);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const objectUrl = useRef<string | null>(null);
  const lock = useRef(false);
  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);
  const inputClass = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-400/20";
  const change = () => { setNotice(""); setError(""); };
  function choosePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    const issue = validateAvatarFile(chosen);
    if (issue || !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(chosen.type)) { setError(issue ?? "Choose a JPG, PNG, WebP or GIF image."); return; }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(chosen);
    setPreview(objectUrl.current); setPhoto(chosen); setRemovePhoto(false); change();
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    setError(""); setNotice("");
    const edits = { displayName, username, bio, interests, avatarUrl: removePhoto ? "" : savedAvatar };
    try { validateProfileEdits(edits); } catch (failure) { setError(failure instanceof Error ? failure.message : "Please check your profile details."); return; }
    lock.current = true; setBusy(true); setUploadPct(0);
    try {
      let avatarUrl = edits.avatarUrl;
      if (photo) { const uploaded = await uploadToCloudinary(photo, setUploadPct); avatarUrl = uploaded.secure_url; }
      const saved = await saveProfileEdits(profile.uid, { ...edits, avatarUrl });
      setDisplayName(saved.displayName); setUsername(saved.username); setBio(saved.bio); setInterests(saved.interests);
      setSavedAvatar(saved.avatarUrl); setPreview(saved.avatarUrl); setPhoto(null); setRemovePhoto(false);
      if (objectUrl.current) { URL.revokeObjectURL(objectUrl.current); objectUrl.current = null; }
      await refreshProfile(); setNotice("Your profile has been updated.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save your profile. Please try again."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
    <fieldset disabled={busy} className="space-y-6">
      <legend className="sr-only">Profile details</legend>
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => file.current?.click()} aria-label="Change profile image" className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-emerald-200 bg-emerald-50">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Profile image preview" className="h-full w-full object-cover" />
          ) : <Camera className="h-7 w-7 text-emerald-600" />}
        </button>
        <div><button type="button" onClick={() => file.current?.click()} className="text-sm font-semibold text-emerald-700">Change photo</button><p className="mt-1 text-xs text-slate-500">JPG, PNG, WebP or GIF · Up to 5 MB</p>
          {preview && <button type="button" onClick={() => { if (objectUrl.current) { URL.revokeObjectURL(objectUrl.current); objectUrl.current = null; } setPhoto(null); setPreview(""); setRemovePhoto(true); change(); }} className="mt-2 text-xs font-semibold text-red-600">Remove photo</button>}
        </div>
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={choosePhoto} />
      </div>
      <label className="block text-sm font-semibold">Display name<input required minLength={2} maxLength={50} value={displayName} onChange={(event) => { setDisplayName(event.target.value); change(); }} autoComplete="name" className={inputClass} /></label>
      <label className="block text-sm font-semibold">Username<input required minLength={3} maxLength={20} value={username} onChange={(event) => { setUsername(event.target.value.toLowerCase()); change(); }} autoCapitalize="none" autoComplete="username" spellCheck={false} className={inputClass} /><span className="mt-1 block text-xs font-normal text-slate-500">Letters, numbers and underscores. Your username must be available.</span></label>
      <label className="block text-sm font-semibold">Bio<textarea maxLength={200} rows={3} value={bio} onChange={(event) => { setBio(event.target.value); change(); }} className={`${inputClass} resize-none`} /><span className="mt-1 block text-right text-xs font-normal text-slate-500">{bio.length}/200</span></label>
      <fieldset><legend className="mb-2 text-sm font-semibold">Interests</legend><p className="mb-3 text-xs text-slate-500">Choose at least 3. These help personalize your feed.</p><div className="flex flex-wrap gap-2">{ISLAMIC_CATEGORIES.map((category) => {
        const selected = interests.includes(category);
        return <button type="button" key={category} aria-pressed={selected} onClick={() => { setInterests((previous) => selected ? previous.filter((item) => item !== category) : [...previous, category]); change(); }} className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium ${selected ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{selected && <Check className="h-3 w-3" />}{category}</button>;
      })}</div><p className="mt-2 text-xs text-slate-500">{interests.length} selected</p></fieldset>
    </fieldset>
    {busy && photo && <p role="status" className="text-sm text-slate-500">{uploadPct < 100 ? `Uploading photo… ${uploadPct}%` : "Saving profile…"}</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {notice && <p role="status" className="text-sm font-medium text-emerald-700">{notice} <Link href={`/profile/${profile.uid}`} className="underline">View profile</Link></p>}
    <div className="flex items-center justify-end gap-3">{!busy && <Link href={`/profile/${profile.uid}`} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Cancel</Link>}<button type="submit" disabled={busy} className="flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save changes</button></div>
  </form>;
}
