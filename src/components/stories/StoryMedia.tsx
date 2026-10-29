"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Story } from "@/src/types";
import { isStoryTap, storyProgress } from "@/src/lib/storyPlayback";

export default function StoryMedia({ story, paused: panelOpen, muted, onMutedChange, onProgress, onReady, onNext, onPrevious }: {
  story: Story; paused: boolean; muted: boolean; onMutedChange: (muted: boolean) => void;
  onProgress: (progress: number) => void; onReady: () => void; onNext: () => void; onPrevious: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const elapsed = useRef(0);
  const advanced = useRef(false);
  const press = useRef<{ id: number; time: number; x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [holding, setHolding] = useState(false);
  const [manualPause, setManualPause] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const callbacks = useRef({ onProgress, onReady, onNext });
  useEffect(() => { callbacks.current = { onProgress, onReady, onNext }; }, [onProgress, onReady, onNext]);
  const paused = panelOpen || holding || manualPause || hidden || !ready || buffering || blocked || error;
  const advance = useCallback(() => {
    if (advanced.current) return;
    advanced.current = true;
    callbacks.current.onProgress(100);
    callbacks.current.onNext();
  }, []);

  useEffect(() => {
    const visibility = () => { setHidden(document.hidden); setHolding(false); press.current = null; };
    const release = () => { setHolding(false); press.current = null; };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", release);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("blur", release); };
  }, []);

  // Images keep their elapsed viewing time across every pause and resume.
  useEffect(() => {
    if (story.mediaType !== "image" || paused) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      elapsed.current += now - previous;
      previous = now;
      const progress = storyProgress(elapsed.current, Math.min(60, Math.max(1, story.duration || 7)) * 1000);
      callbacks.current.onProgress(progress);
      if (progress >= 100) { window.clearInterval(timer); advance(); }
    }, 50);
    return () => window.clearInterval(timer);
  }, [paused, story.mediaType, story.duration, advance]);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (paused) { element.pause(); return; }
    let active = true;
    void element.play().catch(() => { if (active) setBlocked(true); });
    return () => { active = false; element.pause(); };
  }, [paused, attempt]);

  const mediaReady = () => { setReady(true); setBuffering(false); callbacks.current.onReady(); };
  const togglePlayback = () => {
    if (blocked && video.current) {
      // The play call runs directly inside the user gesture for autoplay restrictions.
      void video.current.play().then(() => { setBlocked(false); setManualPause(false); }).catch(() => setBlocked(true));
    } else setManualPause((value) => !value);
  };
  return <div className="relative h-full w-full max-w-md select-none touch-none"
    onContextMenu={(event) => event.preventDefault()}
    onPointerDown={(event) => {
      if ((event.target as HTMLElement).closest("button") || panelOpen || !event.isPrimary || event.button !== 0) return;
      press.current = { id: event.pointerId, time: performance.now(), x: event.clientX, y: event.clientY };
      event.currentTarget.setPointerCapture(event.pointerId);
      setHolding(true);
    }}
    onPointerUp={(event) => {
      const start = press.current;
      if (!start || start.id !== event.pointerId) return;
      press.current = null;
      setHolding(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (isStoryTap(performance.now() - start.time, Math.hypot(event.clientX - start.x, event.clientY - start.y))) {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left + bounds.width / 2) onPrevious(); else onNext();
      }
    }}
    onPointerCancel={() => { press.current = null; setHolding(false); }}
    onLostPointerCapture={() => { press.current = null; setHolding(false); }}>
    {story.mediaType === "video" ? <video key={attempt} ref={video} src={story.mediaUrl} muted={muted} playsInline preload="auto"
      className="h-full w-full object-contain" onCanPlay={mediaReady} onPlaying={() => { setBuffering(false); setBlocked(false); }}
      onWaiting={() => setBuffering(true)} onError={() => setError(true)} onEnded={advance}
      onTimeUpdate={(event) => { const element = event.currentTarget; callbacks.current.onProgress(storyProgress(element.currentTime, element.duration)); }}
    /> : (
      // eslint-disable-next-line @next/next/no-img-element
      <img key={attempt} src={story.mediaUrl} alt={`Story by @${story.username}`} draggable={false} decoding="async"
        className="h-full w-full object-contain" onLoad={mediaReady} onError={() => setError(true)} />
    )}
    {(!ready || buffering) && !error && <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20"><Loader2 aria-label="Loading story" className="h-8 w-8 animate-spin text-white" /></div>}
    {error && <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 px-6 text-center text-white"><p>Could not load this story.</p><button onClick={() => { setError(false); setReady(false); setBuffering(false); setAttempt((value) => value + 1); }} className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900">Retry</button></div>}
    <div className="absolute bottom-28 left-4 right-4 flex items-center justify-between gap-3">
      <button onClick={togglePlayback} aria-label={manualPause || blocked ? "Play story" : "Pause story"} className="rounded-full bg-black/60 p-2.5 text-white hover:bg-black/80">
        {manualPause || blocked ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
      </button>
      {holding && <span className="rounded-full bg-black/60 px-3 py-1 text-xs text-white">Paused</span>}
      {story.mediaType === "video" && <button onClick={() => onMutedChange(!muted)} aria-label={muted ? "Unmute story" : "Mute story"} aria-pressed={!muted} className="rounded-full bg-black/60 p-2.5 text-white hover:bg-black/80">{muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}</button>}
    </div>
    <button aria-label="Previous story" disabled={panelOpen} onClick={onPrevious} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1 text-white hover:bg-black/70"><ChevronLeft className="h-6 w-6" /></button>
    <button aria-label="Next story" disabled={panelOpen} onClick={onNext} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1 text-white hover:bg-black/70"><ChevronRight className="h-6 w-6" /></button>
  </div>;
}
