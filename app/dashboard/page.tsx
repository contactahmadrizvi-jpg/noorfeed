"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/src/context/AuthContext";
import type { DayStats } from "@/app/api/creator/analytics/route";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Eye,
  Heart,
  BarChart2,
  TrendingUp,
  Loader2,
  AlertCircle,
  Users,
} from "lucide-react";

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className={`inline-flex items-center justify-center rounded-xl p-2.5 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6 px-4 py-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-slate-100" />
        ))}
      </div>
      <div className="h-64 rounded-2xl bg-slate-100" />
    </div>
  );
}

export default function DashboardPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [data, setData]       = useState<DayStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  // Redirect non-authenticated users
  useEffect(() => {
    if (!authLoading && !user) router.replace("/");
  }, [authLoading, user, router]);

  // Fetch analytics
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `/api/creator/analytics?creatorId=${encodeURIComponent(user.uid)}`,
          { credentials: "include" }
        );
        if (!res.ok) {
          const j = await res.json() as { error?: string };
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        const json = await res.json() as { data: DayStats[] };
        setData(json.data ?? []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load analytics.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  // Aggregate totals
  const totalViews = data.reduce((s, d) => s + d.views, 0);
  const totalLikes = data.reduce((s, d) => s + d.likes, 0);
  const peakViews  = data.length > 0 ? Math.max(...data.map((d) => d.views)) : 0;
  const engagRate  = totalViews > 0 ? ((totalLikes / totalViews) * 100).toFixed(1) : "0";

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
          <BarChart2 className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Creator Dashboard</h1>
          <p className="text-sm text-slate-500">Last 30 days · @{profile?.username}</p>
        </div>
        {/* PostHog integration badge */}
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-600">
          ⬡ PostHog
        </span>
      </div>

      {loading && <DashboardSkeleton />}

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Could not load analytics</p>
            <p className="mt-0.5 text-xs opacity-80">{error}</p>
            <p className="mt-1 text-xs opacity-60">
              Make sure POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID are set in .env.local
            </p>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-6">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              icon={Eye}
              label="Total Views"
              value={totalViews.toLocaleString()}
              sub="30-day total"
              color="bg-blue-50 text-blue-600"
            />
            <StatCard
              icon={Heart}
              label="Total Likes"
              value={totalLikes.toLocaleString()}
              sub="30-day total"
              color="bg-red-50 text-red-500"
            />
            <StatCard
              icon={TrendingUp}
              label="Peak Views"
              value={peakViews.toLocaleString()}
              sub="single day high"
              color="bg-emerald-50 text-emerald-600"
            />
            <StatCard
              icon={Users}
              label="Engagement"
              value={`${engagRate}%`}
              sub="likes / views"
              color="bg-purple-50 text-purple-600"
            />
          </div>

          {/* Chart */}
          {data.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-100 bg-white py-16 text-center">
              <BarChart2 className="h-10 w-10 text-slate-200" />
              <p className="text-sm font-semibold text-slate-600">No data yet</p>
              <p className="text-xs text-slate-400">
                Start creating posts and engaging with your audience to see analytics here.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-slate-700">
                Views & Likes — Last 30 Days
              </h2>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart
                  data={data}
                  margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorLikes" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    tickFormatter={(v: string) => v.slice(5)} // "MM-DD"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      border: "1px solid #e2e8f0",
                      fontSize: "12px",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
                    }}
                    labelFormatter={(v) =>
                      new Date(String(v)).toLocaleDateString("en-US", {
                        month: "short",
                        day:   "numeric",
                      })
                    }
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="views"
                    name="Views"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#colorViews)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="likes"
                    name="Likes"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#colorLikes)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Attribution */}
          <p className="text-center text-xs text-slate-400">
            Data powered by{" "}
            <a
              href="https://posthog.com"
              target="_blank"
              rel="noreferrer"
              className="text-orange-500 hover:underline"
            >
              PostHog HogQL
            </a>{" "}
            · Cached via Upstash Redis
          </p>
        </div>
      )}
    </div>
  );
}
