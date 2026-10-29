export function storyUploadTime(createdAt: { toMillis(): number } | null, now: number) {
  if (!createdAt) return { label: "Uploading…", exact: "" };
  const ms = createdAt.toMillis();
  const elapsed = Math.max(0, now - ms);
  const label = elapsed < 60_000 ? "Just now" : elapsed < 3_600_000
    ? `${Math.floor(elapsed / 60_000)}m ago` : elapsed < 86_400_000
      ? `${Math.floor(elapsed / 3_600_000)}h ago` : `${Math.floor(elapsed / 86_400_000)}d ago`;
  return { label, exact: new Date(ms).toLocaleString() };
}

export function storyProgress(elapsed: number, duration: number) {
  return duration > 0 ? Math.max(0, Math.min(100, elapsed / duration * 100)) : 0;
}

export function isStoryTap(duration: number, distance: number) {
  return duration < 180 && distance < 12;
}
