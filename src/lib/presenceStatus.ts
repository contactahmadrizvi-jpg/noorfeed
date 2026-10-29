import { UserPresence } from "@/src/types";

export const PRESENCE_TTL = 90_000;
type TimestampLike = { toMillis: () => number };
export type PresenceRecord = UserPresence & { sessions?: Record<string, TimestampLike> };

export function presenceStatus(presence: PresenceRecord | null, now: number) {
  if (!presence) return { online: false, label: "Status unavailable" };
  const lastSeen = presence.lastSeen?.toMillis?.() ?? 0;
  const sessions = Object.values(presence.sessions ?? {}).map((stamp) => stamp?.toMillis?.() ?? 0);
  const latest = Math.max(lastSeen, ...sessions);
  const online = presence.sessions !== undefined
    ? sessions.some((stamp) => stamp > 0 && now - stamp < PRESENCE_TTL)
    : presence.online && lastSeen > 0 && now - lastSeen < PRESENCE_TTL;
  if (online) return { online: true, label: "Online now" };
  if (!latest) return { online: false, label: "Offline" };
  const elapsed = Math.max(0, now - latest);
  const date = new Date(latest);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  let label: string;
  if (elapsed < 60_000) label = "Last seen just now";
  else if (elapsed < 3_600_000) label = `Last seen ${Math.floor(elapsed / 60_000)} min ago`;
  else if (date.toDateString() === new Date(now).toDateString()) label = `Last seen today at ${time}`;
  else {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    label = date.toDateString() === yesterday.toDateString()
      ? `Last seen yesterday at ${time}`
      : `Last seen ${date.toLocaleDateString([], { month: "short", day: "numeric", ...(date.getFullYear() !== new Date(now).getFullYear() ? { year: "numeric" } : {}) })} at ${time}`;
  }
  return { online: false, label };
}
