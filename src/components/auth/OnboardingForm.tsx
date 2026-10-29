"use client";

import { useState, useRef } from "react";
import { User } from "firebase/auth";
import {
  doc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { ISLAMIC_CATEGORIES, IslamicCategory } from "@/src/types";
import { uploadToCloudinary } from "@/src/lib/cloudinary";
import { useAuth } from "@/src/context/AuthContext";
import {
  validateUsername,
  validateDisplayName,
  validateBio,
  validateAvatarFile,
} from "@/src/lib/validators";
import { AtSign, User as UserIcon, Camera, Loader2, Check, AlertCircle } from "lucide-react";

interface Props {
  firebaseUser: User;
  onComplete: () => void;
}

interface FieldErrors {
  username?: string;
  displayName?: string;
  bio?: string;
  avatar?: string;
}

export default function OnboardingForm({ firebaseUser, onComplete }: Props) {
  const { refreshProfile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [username, setUsername]         = useState("");
  const [displayName, setDisplayName]   = useState(
    // Pre-fill from Google display name if available
    firebaseUser.displayName ?? ""
  );
  const [bio, setBio]                   = useState("");
  const [interests, setInterests]       = useState<IslamicCategory[]>([]);
  const [avatarFile, setAvatarFile]     = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(
    firebaseUser.photoURL ?? ""
  );
  const [uploadPct, setUploadPct]       = useState(0);
  const [fieldErrors, setFieldErrors]   = useState<FieldErrors>({});
  const [globalError, setGlobalError]   = useState("");
  const [loading, setLoading]           = useState(false);
  const [touched, setTouched]           = useState<Record<string, boolean>>({});

  const toggleInterest = (cat: IslamicCategory) =>
    setInterests((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );

  const validateField = (name: string, value: string) => {
    let err: string | null = null;
    if (name === "username")    err = validateUsername(value);
    if (name === "displayName") err = validateDisplayName(value);
    if (name === "bio")         err = validateBio(value);
    setFieldErrors((prev) => ({ ...prev, [name]: err ?? undefined }));
  };

  const handleBlur = (name: string, value: string) => {
    setTouched((prev) => ({ ...prev, [name]: true }));
    validateField(name, value);
  };

  const handleAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateAvatarFile(file);
    if (err) { setFieldErrors((prev) => ({ ...prev, avatar: err })); return; }
    setFieldErrors((prev) => ({ ...prev, avatar: undefined }));
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError("");
    setTouched({ username: true, displayName: true, bio: true });

    const usernameErr    = validateUsername(username);
    const displayNameErr = validateDisplayName(displayName);
    const bioErr         = validateBio(bio);
    setFieldErrors({ username: usernameErr ?? undefined, displayName: displayNameErr ?? undefined, bio: bioErr ?? undefined });
    if (usernameErr || displayNameErr || bioErr) return;

    if (interests.length < 3) {
      setGlobalError("Select at least 3 Islamic categories to personalise your feed.");
      return;
    }

    setLoading(true);
    try {
      const clean = username.toLowerCase().trim();

      // Uniqueness check
      const snap = await getDocs(
        query(collection(db, "users"), where("username", "==", clean))
      );
      if (!snap.empty) {
        setFieldErrors((prev) => ({ ...prev, username: `@${clean} is already taken.` }));
        setLoading(false);
        return;
      }

      let avatarUrl = firebaseUser.photoURL ?? "";
      if (avatarFile) {
        const res = await uploadToCloudinary(avatarFile, setUploadPct);
        avatarUrl = res.secure_url;
      }

      await setDoc(doc(db, "users", firebaseUser.uid), {
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? "",
        username: clean,
        displayName: displayName.trim(),
        bio: bio.trim(),
        avatarUrl,
        interests,
        followersCount: 0,
        followingCount: 0,
        createdAt: serverTimestamp(),
      });

      await refreshProfile();
      onComplete();
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : "Setup failed. Try again.");
    } finally {
      setLoading(false);
      setUploadPct(0);
    }
  };

  const inputClass = (name: keyof FieldErrors) =>
    `w-full rounded-xl border py-3 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 outline-none transition ${
      touched[name] && fieldErrors[name]
        ? "border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-400/20"
        : "border-slate-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
    }`;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Set up your profile</h2>
        <p className="mt-1 text-sm text-slate-500">Claim your @username and pick your interests.</p>
      </div>

      {globalError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {globalError}
        </div>
      )}

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-emerald-400"
          aria-label="Upload avatar"
        >
          {avatarPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
          ) : (
            <Camera className="h-6 w-6 text-slate-400" />
          )}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
        <div>
          <p className="text-sm text-slate-600">Profile photo</p>
          <p className="text-xs text-slate-400">Max 5 MB · JPG, PNG, WebP</p>
          {fieldErrors.avatar && (
            <p className="mt-0.5 text-xs text-red-500">{fieldErrors.avatar}</p>
          )}
        </div>
      </div>

      {/* Display name */}
      <div className="space-y-1">
        <label className="relative block">
          <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Display name"
            value={displayName}
            onChange={(e) => { setDisplayName(e.target.value); if (touched.displayName) validateField("displayName", e.target.value); }}
            onBlur={() => handleBlur("displayName", displayName)}
            maxLength={50}
            className={inputClass("displayName")}
          />
        </label>
        <div className="flex items-center justify-between pl-1">
          {touched.displayName && fieldErrors.displayName ? (
            <p className="text-xs text-red-500">{fieldErrors.displayName}</p>
          ) : <span />}
          <p className={`text-xs ${displayName.length > 45 ? "text-orange-500" : "text-slate-400"}`}>
            {displayName.length}/50
          </p>
        </div>
      </div>

      {/* Username */}
      <div className="space-y-1">
        <label className="relative block">
          <AtSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="username"
            value={username}
            onChange={(e) => {
              const clean = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
              setUsername(clean);
              if (touched.username) validateField("username", clean);
            }}
            onBlur={() => handleBlur("username", username)}
            className={inputClass("username")}
          />
        </label>
        <div className="flex items-center justify-between pl-1">
          {touched.username && fieldErrors.username ? (
            <p className="text-xs text-red-500">{fieldErrors.username}</p>
          ) : (
            <p className="text-xs text-slate-400">Lowercase, letters, numbers, underscores</p>
          )}
          <p className={`text-xs ${username.length > 18 ? "text-orange-500" : "text-slate-400"}`}>
            {username.length}/20
          </p>
        </div>
      </div>

      {/* Bio */}
      <div className="space-y-1">
        <textarea
          placeholder="Short bio (optional)"
          value={bio}
          onChange={(e) => { setBio(e.target.value); if (touched.bio) validateField("bio", e.target.value); }}
          onBlur={() => handleBlur("bio", bio)}
          rows={2}
          maxLength={200}
          className={`w-full resize-none rounded-xl border px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition ${
            touched.bio && fieldErrors.bio
              ? "border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-400/20"
              : "border-slate-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
          }`}
        />
        <div className="flex items-center justify-between pl-1">
          {touched.bio && fieldErrors.bio ? (
            <p className="text-xs text-red-500">{fieldErrors.bio}</p>
          ) : <span />}
          <p className={`text-xs ${bio.length > 180 ? "text-orange-500" : "text-slate-400"}`}>
            {bio.length}/200
          </p>
        </div>
      </div>

      {/* Interests */}
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">
          Interests{" "}
          <span className="font-normal text-slate-400">
            ({interests.length} selected — min. 3)
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          {ISLAMIC_CATEGORIES.map((cat) => {
            const active = interests.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleInterest(cat)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300"
                }`}
              >
                {active && <Check className="h-3 w-3" />}
                {cat}
              </button>
            );
          })}
        </div>
        {interests.length > 0 && interests.length < 3 && (
          <p className="mt-2 text-xs text-orange-500">
            {3 - interests.length} more needed
          </p>
        )}
      </div>

      {/* Upload progress */}
      {loading && uploadPct > 0 && uploadPct < 100 && (
        <div className="space-y-1">
          <p className="text-xs text-slate-500">Uploading photo… {uploadPct}%</p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${uploadPct}%` }} />
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Complete Setup
      </button>
    </form>
  );
}
