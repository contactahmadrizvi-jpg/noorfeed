"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Compass, PlusSquare, Bell, User } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";

const navItems = [
  { label: "Home",          href: "/",              icon: Home },
  { label: "Explore",       href: "/explore",       icon: Compass },
  { label: "Create",        href: "/create",        icon: PlusSquare },
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Profile",       href: "/profile",       icon: User },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-slate-100 md:bg-white">
      <nav className="flex flex-col gap-1 p-4 pt-6">
        {navItems.map(({ label, href, icon: Icon }) => {
          const resolvedHref = label === "Profile" && user ? `/profile/${user.uid}` : href;
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={label}
              href={resolvedHref}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                active
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Icon
                className={`h-5 w-5 shrink-0 ${active ? "text-emerald-600" : "text-slate-500"}`}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto p-4">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-xs font-semibold text-emerald-700">🌙 Daily Reminder</p>
          <p className="mt-1 text-xs text-emerald-600 leading-relaxed">
            "Whoever believes in Allah and the Last Day, let him speak good or remain silent."
          </p>
          <p className="mt-1 text-[10px] text-emerald-500">— Bukhari & Muslim</p>
        </div>
      </div>
    </aside>
  );
}
