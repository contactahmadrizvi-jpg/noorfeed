"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

interface Props {
  src: string;
  poster?: string;
}

export default function VideoPlayer({ src, poster }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [visible, setVisible] = useState(false);

  // Step 1 — card-level IntersectionObserver decides whether to load the video at all.
  // The <video> is only injected into the DOM once the container enters the viewport.
  // This prevents browsers from prefetching dozens of video files on page load.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const obs = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "200px", threshold: 0 } // start loading 200 px before entering view
    );
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

  // Step 2 — once the video element is mounted, a second observer handles
  // play/pause based on 60 % visibility so off-screen videos stop consuming CPU.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.6 }
    );
    obs.observe(video);
    return () => obs.disconnect();
  }, [visible]); // re-runs when video element mounts (visible flips true)

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden bg-black"
      style={{ aspectRatio: "9/16", maxHeight: "520px" }}
    >
      {visible ? (
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          muted
          loop
          playsInline
          preload="none" // don't prefetch — we control loading via the observer
          className="h-full w-full object-cover"
        />
      ) : (
        /* Placeholder keeps the correct aspect-ratio height while offscreen */
        <div className="h-full w-full bg-slate-900" />
      )}

      <button
        onClick={toggleMute}
        aria-label={muted ? "Unmute" : "Mute"}
        className="absolute bottom-3 right-3 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
    </div>
  );
}
