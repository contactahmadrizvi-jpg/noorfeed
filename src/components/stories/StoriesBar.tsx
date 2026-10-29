"use client";

import { useRef, useState } from "react";
import { doc, getDoc, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useVisibleStories } from "@/src/hooks/useVisibleStories";
import { useAuth } from "@/src/context/AuthContext";
import { uploadToCloudinary, getMediaType } from "@/src/lib/cloudinary";
import StoryViewer from "./StoryViewer";
import { PlusCircle, Loader2, Eye, X, Clock } from "lucide-react";

export default function StoriesBar() {
  const { user, profile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const { stories, error: storiesError, retry: retryStories } = useVisibleStories(user?.uid ?? null);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);

  // Duration picker state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState("");
  const [duration, setDuration] = useState(7); // default 7 s
  const [durationPickerOpen, setDurationPickerOpen] = useState(false);

  // Viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  /* ── step 1: user picks a file → open duration picker ── */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !profile) return;
    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
    setDuration(7);
    setDurationPickerOpen(true);
    if (fileRef.current) fileRef.current.value = "";
  };

  /* ── step 2: confirm duration → upload & save ── */
  const handleConfirmUpload = async () => {
    if (!pendingFile || !user || !profile) return;
    setDurationPickerOpen(false);
    setUploading(true);
    setUploadError("");
    try {
      const settings = await getDoc(doc(db, "users", user.uid));
      if (!settings.exists()) throw new Error("Your profile is unavailable. Please try again.");
      const audience = settings.data().storyAudience ?? "public";
      if (audience !== "public" && audience !== "followers") throw new Error("Please save your story audience in Settings first.");
      const result = await uploadToCloudinary(pendingFile, setUploadPct);
      await addDoc(collection(db, "stories"), {
        audience,
        userId: user.uid,
        username: profile.username,
        userAvatar: profile.avatarUrl,
        mediaUrl: result.secure_url,
        mediaType: getMediaType(pendingFile),
        duration,
        viewedBy: [],
        viewsCount: 0,
        likedBy: [],
        likesCount: 0,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        createdAt: serverTimestamp(),
      });
      // onSnapshot listener will update stories automatically
    } catch (err) {
      console.error("Story upload error:", err);
      setUploadError(err instanceof Error ? err.message : "Could not upload your story. Please try again.");
    } finally {
      setUploading(false);
      setUploadPct(0);
      setPendingFile(null);
      setPendingPreview("");
    }
  };

  const cancelPicker = () => {
    setDurationPickerOpen(false);
    setPendingFile(null);
    setPendingPreview("");
  };

  const openViewer = (index: number) => {
    setViewerIndex(index);
    setViewerOpen(true);
  };

  return (
    <>
      {/* ── Duration picker modal ── */}
      {durationPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-lg">Story Duration</h3>
              <button
                onClick={cancelPicker}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Preview thumbnail */}
            {pendingPreview && (
              <div className="overflow-hidden rounded-xl bg-black" style={{ aspectRatio: "9/16", maxHeight: "200px" }}>
                {pendingFile?.type.startsWith("video/") ? (
                  <video
                    src={pendingPreview}
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pendingPreview}
                    alt="preview"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
            )}

            {/* Slider */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Clock className="h-4 w-4 text-emerald-500" />
                  Display duration
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700">
                  {duration}s
                </span>
              </div>

              <input
                type="range"
                min={1}
                max={60}
                step={1}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />

              <div className="flex justify-between text-xs text-slate-400">
                <span>1s</span>
                <span>15s</span>
                <span>30s</span>
                <span>45s</span>
                <span>60s</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={cancelPicker}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmUpload}
                className="flex-1 rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-white hover:bg-emerald-600"
              >
                Post Story
              </button>
            </div>
          </div>
        </div>
      )}

      {(storiesError || uploadError) && <p role="alert" className="px-4 py-2 text-xs text-red-600">{uploadError || storiesError} {storiesError && <button onClick={retryStories} className="font-semibold underline">Retry</button>}</p>}

      {/* ── Stories scroll row ── */}
      <div className="flex gap-3 overflow-x-auto px-4 py-3 scrollbar-hide">

        {/* Your Story button */}
        {user && profile && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex shrink-0 flex-col items-center gap-1"
            aria-label="Add story"
          >
            <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-emerald-300 bg-emerald-50 transition hover:border-emerald-500">
              {uploading ? (
                <div className="flex flex-col items-center gap-0.5">
                  <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
                  <span className="text-[9px] text-emerald-600">{uploadPct}%</span>
                </div>
              ) : profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatarUrl}
                  alt=""
                  className="h-full w-full object-cover opacity-70"
                />
              ) : (
                <PlusCircle className="h-7 w-7 text-emerald-400" />
              )}
              {!uploading && (
                <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-white">
                  <span className="text-[10px] font-bold leading-none">+</span>
                </span>
              )}
            </div>
            <span className="text-[11px] font-medium text-slate-600">Your Story</span>
          </button>
        )}

        {/* Other stories */}
        {stories.map((story, i) => {
          const isOwn = user?.uid === story.userId;
          return (
            <button
              key={story.id}
              onClick={() => openViewer(i)}
              className="flex shrink-0 flex-col items-center gap-1"
            >
              {/* Avatar ring — teal for unseen, grey for own */}
              <div className="relative">
                <div
                  className={`h-16 w-16 overflow-hidden rounded-full p-0.5 ${
                    isOwn ? "border-2 border-slate-300" : "border-2 border-emerald-400"
                  }`}
                >
                  {story.userAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={story.userAvatar}
                      alt={story.username}
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-emerald-100 text-lg font-bold text-emerald-600">
                      {story.username[0]?.toUpperCase()}
                    </div>
                  )}
                </div>

                {/* View count badge — only shown to the story owner */}
                {isOwn && story.viewsCount > 0 && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-full bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold text-white shadow">
                    <Eye className="h-2.5 w-2.5" />
                    {story.viewsCount}
                  </span>
                )}
              </div>

              <span className="max-w-[64px] truncate text-[11px] font-medium text-slate-600">
                {isOwn ? "You" : `@${story.username}`}
              </span>
            </button>
          );
        })}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {viewerOpen && (
        <StoryViewer
          stories={stories}
          startIndex={viewerIndex}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
  );
}
