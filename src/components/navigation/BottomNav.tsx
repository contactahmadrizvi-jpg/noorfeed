"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Compass, PlusSquare, Bell, User } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import { useUnreadNotifications } from "@/src/hooks/useUnreadNotifications";

const navItems = [
  { label: "Home",    href: "/",              icon: Home },
  { label: "Explore", href: "/explore",       icon: Compass },
  { label: "Create",  href: "/create",        icon: PlusSquare },
  { label: "Alerts",  href: "/notifications", icon: Bell },
  { label: "Profile", href: "/profile",       icon: User },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const unread = useUnreadNotifications();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-slate-100 bg-white/95 backdrop-blur-sm md:hidden">
      {navItems.map(({ label, href, icon: Icon }) => {
        const resolvedHref =
          label === "Profile" && user ? `/profile/${user.uid}` : href;
        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
        const isCreate = label === "Create";
        const isAlerts = label === "Alerts";

        return (
          <Link
            key={label}
            href={resolvedHref}
            aria-label={label}
            className="flex flex-col items-center justify-center gap-0.5"
          >
            {isCreate ? (
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 shadow-md shadow-emerald-200 transition active:scale-95">
                <Icon className="h-5 w-5 text-white" />
              </span>
            ) : isAlerts ? (
              /* Bell with badge */
              <span className="relative flex flex-col items-center gap-0.5">
                <span className="relative">
                  <Icon
                    className={`h-6 w-6 ${active ? "text-emerald-600" : "text-slate-400"}`}
                  />
                  {unread > 0 && (
                    <span className="absolute -right-1.5 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </span>
                <span
                  className={`text-[10px] font-medium ${
                    active ? "text-emerald-600" : "text-slate-400"
                  }`}
                >
                  {label}
                </span>
              </span>
            ) : (
              <>
                <Icon
                  className={`h-6 w-6 ${active ? "text-emerald-600" : "text-slate-400"}`}
                />
                <span
                  className={`text-[10px] font-medium ${
                    active ? "text-emerald-600" : "text-slate-400"
                  }`}
                >
                  {label}
                </span>
              </>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
