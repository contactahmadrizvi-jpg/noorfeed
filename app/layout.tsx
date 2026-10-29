import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/src/context/AuthContext";
import TopHeader from "@/src/components/navigation/TopHeader";
import Sidebar from "@/src/components/navigation/Sidebar";
import BottomNav from "@/src/components/navigation/BottomNav";
import OnboardingGate from "@/src/components/auth/OnboardingGate";

export const metadata: Metadata = {
  title: "NoorFeed — Islamic Social Media",
  description:
    "Share reminders, ayahs, hadiths, and connect with the global Muslim community on NoorFeed.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col bg-white text-slate-900 antialiased">
        <AuthProvider>
          {/* Intercepts authenticated users with no Firestore profile */}
          <OnboardingGate />

          <TopHeader />

          <div className="flex flex-1">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>

          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
