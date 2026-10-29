"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { uploadToCloudinary, getMediaType } from "@/src/lib/cloudinary";
import { useAuth } from "@/src/context/AuthContext";
import { ISLAMIC_CATEGORIES, IslamicCategory } from "@/src/types";
import {
  validatePostTitle,
  validateCaption,
  validateMediaFile,
} from "@/src/lib/validators";
import { postLimit, formatRetryAfter } from "@/src/lib/rateLimiter";
import {
  X,
  Image as ImageIcon,
  Video,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface FieldErrors {
  title?: string;
  caption?: string;
  media?: string;
}

export default function PostComposer({ open, onClose }: Props) {
  const { user, profile } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle]       = useState("");
  const [caption, setCaption]   = useState("");
  const [category, setCategory] = useState<IslamicCategory>("Short Reminders");
  const [file, setFile]         = useState<File | null>(null);
  const [preview, setPreview]   = useState("");
  const [uploadPct, setUploadPct] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState("");
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const [touched, setTouched]   = useState<Record<string, boolean>>({});

  if (!open) return null;

  const validateField = (name: string, value: string) => {
    let err: string | null = null;
    if (name === "title")   err = validatePostTitle(value);
    if (name === "caption") err = validateCaption(value);
    setFieldErrors((prev) => ({ ...prev, [name]: err ?? undefined }));
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const err = validateMediaFile(f);
    if (err) {
      setFieldErrors((prev) => ({ ...prev, media: err }));
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFieldErrors((prev) => ({ ...prev, media: undefined }));
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const removeFile = () => {
    setFile(null);
    setPreview("");
    setFieldErrors((prev) => ({ ...prev, media: undefined }));
    if (fileRef.current) fileRef.current.value = "";
  };

  const reset = () => {
    setTitle(""); setCaption(""); setCategory("Short Reminders");
    setFile(null); setPreview(""); setUploadPct(0);
    setFieldErrors({}); setGlobalError(""); setLoading(false); setDone(false);
    setTouched({});
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError("");
    setTouched({ title: true, caption: true });

    if (!user || !profile) { setGlobalError("You must be signed in to post."); return; }

    const titleErr   = validatePostTitle(title);
    const captionErr = validateCaption(caption);
    setFieldErrors((prev) => ({
      ...prev,
      title: titleErr ?? undefined,
      caption: captionErr ?? undefined,
    }));
    if (titleErr || captionErr) return;

    // Post rate limit
    const limit = postLimit(user.uid);
    if (!limit.allowed) {
      setGlobalError(
        `You've posted too frequently. Try again in ${formatRetryAfter(limit.retryAfterSeconds!)}.`
      );
      return;
    }

    setLoading(true);
    try {
      let mediaUrl = "";
      let mediaType: "image" | "video" | "text" = "text";

      if (file) {
        const result = await uploadToCloudinary(file, setUploadPct);
        mediaUrl = result.secure_url;
        mediaType = getMediaType(file);
      }

      await addDoc(collection(db, "posts"), {
        userId: user.uid,
        username: profile.username,
        userAvatar: profile.avatarUrl,
        title: title.trim(),
        caption: caption.trim(),
        category,
        mediaUrl,
        mediaType,
        likesCount: 0,
        savesCount: 0,
        sharesCount: 0,
        reportsCount: 0,
        viewsCount: 0,
        isApproved: true,
        createdAt: serverTimestamp(),
      });

      setDone(true);
      setTimeout(() => { handleClose(); router.push("/"); }, 1500);
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : "Failed to post. Try again.");
    } finally {
      setLoading(false);
      setUploadPct(0);
    }
  };

  const inputClass = (name: keyof FieldErrors) =>
    `w-full rounded-xl border px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition ${
      touched[name] && fieldErrors[name]
        ? "border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-400/20"
        : "border-slate-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="w-full max-w-lg rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Create Post</h2>
          <button onClick={handleClose} className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {done && (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle className="h-14 w-14 text-emerald-500" />
            <p className="font-semibold text-slate-800">Post published!</p>
          </div>
        )}

        {!done && (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {globalError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {globalError}
              </div>
            )}

            {/* Title */}
            <div className="space-y-1">
              <input
                type="text"
                placeholder="Post title"
                value={title}
                onChange={(e) => { setTitle(e.target.value); if (touched.title) validateField("title", e.target.value); }}
                onBlur={() => { setTouched((p) => ({ ...p, title: true })); validateField("title", title); }}
                maxLength={100}
                className={inputClass("title")}
              />
              <div className="flex items-center justify-between px-1">
                {touched.title && fieldErrors.title ? (
                  <p className="text-xs text-red-500">{fieldErrors.title}</p>
                ) : <span />}
                <p className={`text-xs ${title.length > 90 ? "text-orange-500" : "text-slate-400"}`}>
                  {title.length}/100
                </p>
              </div>
            </div>

            {/* Caption */}
            <div className="space-y-1">
              <textarea
                placeholder="Write your caption…"
                value={caption}
                onChange={(e) => { setCaption(e.target.value); if (touched.caption) validateField("caption", e.target.value); }}
                onBlur={() => { setTouched((p) => ({ ...p, caption: true })); validateField("caption", caption); }}
                rows={3}
                maxLength={1000}
                className={`${inputClass("caption")} resize-none`}
              />
              <div className="flex items-center justify-between px-1">
                {touched.caption && fieldErrors.caption ? (
                  <p className="text-xs text-red-500">{fieldErrors.caption}</p>
                ) : <span />}
                <p className={`text-xs ${caption.length > 900 ? "text-orange-500" : "text-slate-400"}`}>
                  {caption.length}/1000
                </p>
              </div>
            </div>

            {/* Category */}
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as IslamicCategory)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
            >
              {ISLAMIC_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {/* Media */}
            <div>
              {preview ? (
                <div className="relative">
                  {file?.type.startsWith("video/") ? (
                    <video src={preview} className="max-h-48 w-full rounded-xl object-cover" controls />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt="preview" className="max-h-48 w-full rounded-xl object-cover" />
                  )}
                  <button type="button" onClick={removeFile} className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white">
                    <X className="h-4 w-4" />
                  </button>
                  {file && (
                    <span className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">
                      {(file.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-6 text-sm text-slate-500 transition hover:border-emerald-300 hover:text-emerald-600"
                >
                  <ImageIcon className="h-4 w-4" />
                  <Video className="h-4 w-4" />
                  Add photo or video (optional)
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFile} />
              {fieldErrors.media && (
                <p className="mt-1 pl-1 text-xs text-red-500">{fieldErrors.media}</p>
              )}
              <p className="mt-1 pl-1 text-xs text-slate-400">
                Images up to 10 MB · Videos up to 100 MB
              </p>
            </div>

            {/* Upload progress */}
            {loading && uploadPct > 0 && uploadPct < 100 && (
              <div className="space-y-1">
                <p className="text-xs text-slate-500">Uploading… {uploadPct}%</p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-200"
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Publishing…" : "Publish Post"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
