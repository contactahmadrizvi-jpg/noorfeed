"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, LogOut, Bell, Settings } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import AuthModal from "@/src/components/auth/AuthModal";
import ConfirmDialog from "@/src/components/ConfirmDialog";
import { useUnreadNotifications } from "@/src/hooks/useUnreadNotifications";
import {
  collection,
  query,
  where,
  getDocs,
  limit,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { UserProfile } from "@/src/types";

export default function TopHeader() {
  const { user, profile, logout } = useAuth();
  const router = useRouter();
  const unread = useUnreadNotifications();

  const [authOpen, setAuthOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [authView, setAuthView] = useState<"login" | "signup">("login");
  const [searchVal, setSearchVal] = useState("");
  const [results, setResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (val: string) => {
    setSearchVal(val);
    if (val.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const clean = val.replace(/^@/, "").toLowerCase();
      const q = query(
        collection(db, "users"),
        where("username", ">=", clean),
        where("username", "<=", clean + "\uf8ff"),
        limit(6)
      );
      const snap = await getDocs(q);
      setResults(
        snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<UserProfile, "uid">) }))
      );
    } finally {
      setSearching(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-100 bg-white/95 px-4 backdrop-blur-sm md:px-6">
        {/* Brand */}
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900"
        >
          <span className="text-emerald-500">☽</span>
          <span>NoorFeed</span>
        </button>

        {/* Search */}
        <div className="relative mx-4 hidden max-w-xs flex-1 md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchVal}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search @username…"
            className="w-full rounded-full border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-400/20"
          />
          {results.length > 0 && (
            <div className="absolute left-0 top-full mt-2 w-full overflow-hidden rounded-xl border border-slate-100 bg-white shadow-lg z-50">
              {results.map((u) => (
                <button
                  key={u.uid}
                  onClick={() => {
                    router.push(`/profile/${u.uid}`);
                    setResults([]);
                    setSearchVal("");
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                >
                  {u.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-600">
                      {u.displayName[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{u.displayName}</p>
                    <p className="text-xs text-slate-500">@{u.username}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {user && profile ? (
            <>
              {/* Notification bell with badge */}
              <button
                onClick={() => router.push("/notifications")}
                aria-label="Notifications"
                className="relative rounded-full p-2 text-slate-500 transition hover:bg-slate-100"
              >
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>

              {/* Avatar */}
              <button
                onClick={() => router.push(`/profile/${user.uid}`)}
                className="flex items-center gap-2 rounded-full p-1.5 transition hover:bg-slate-100"
              >
                {profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatarUrl}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-600">
                    {profile.displayName[0]?.toUpperCase()}
                  </div>
                )}
              </button>

              {/* Sign out */}
              <button onClick={() => router.push("/settings")} aria-label="Settings" className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100"><Settings className="h-5 w-5" /></button>
              <button
                onClick={() => setLogoutOpen(true)}
                aria-label="Sign out"
                className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setAuthView("login"); setAuthOpen(true); }}
                className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Sign in
              </button>
              <button
                onClick={() => { setAuthView("signup"); setAuthOpen(true); }}
                className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
              >
                Join
              </button>
            </>
          )}
        </div>
      </header>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} defaultView={authView} />
      {logoutOpen && user && <ConfirmDialog
        title="Log out?"
        description="Are you sure you want to log out of your account?"
        confirmLabel="Log out"
        onClose={() => setLogoutOpen(false)}
        onConfirm={async () => { await logout(); router.push("/"); }}
      />}
    </>
  );
}
