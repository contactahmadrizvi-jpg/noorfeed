import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AuthProvider } from "@/src/context/AuthContext";
import TopHeader from "@/src/components/navigation/TopHeader";
import Sidebar from "@/src/components/navigation/Sidebar";
import BottomNav from "@/src/components/navigation/BottomNav";
import OnboardingGate from "@/src/components/auth/OnboardingGate";
import PresenceWriter from "@/src/components/PresenceWriter";
import PostHogProvider from "@/src/components/analytics/PostHogProvider";

export const metadata: Metadata = {
  title: "NoorFeed — Islamic Social Media",
  description:
    "Share reminders, ayahs, hadiths, and connect with the global Muslim community on NoorFeed.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" data-scroll-behavior="smooth">
      <body className="flex min-h-full flex-col bg-white text-slate-900 antialiased">
        <AuthProvider>
          <PresenceWriter />
          <OnboardingGate />
          <TopHeader />

          <div className="flex flex-1">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
              {/*
                PostHogProvider uses useSearchParams() which requires Suspense.
                Wrapping here keeps the boundary as close to the leaf as possible
                so it never blocks the rest of the shell from streaming.
              */}
              <Suspense>
                <PostHogProvider>
                  {children}
                </PostHogProvider>
              </Suspense>
            </main>
          </div>

          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
