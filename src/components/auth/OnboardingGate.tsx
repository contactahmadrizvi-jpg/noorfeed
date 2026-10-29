"use client";

import { useAuth } from "@/src/context/AuthContext";
import OnboardingForm from "./OnboardingForm";

/**
 * Rendered at the root layout level.
 * When a user is authenticated but has no Firestore profile doc
 * (i.e. they closed the browser mid-onboarding or signed up then abandoned),
 * this gate blocks all interaction until they complete onboarding.
 */
export default function OnboardingGate() {
  const { user, needsOnboarding, loading, refreshProfile } = useAuth();

  if (loading || !user || !needsOnboarding) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md overflow-y-auto rounded-2xl bg-white p-8 shadow-2xl max-h-[90vh]">
        {/* Brand */}
        <div className="mb-6 flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">☽</span>
          <span className="text-lg font-bold tracking-tight text-emerald-600">NoorFeed</span>
        </div>

        <OnboardingForm
          firebaseUser={user}
          onComplete={async () => {
            // Refresh profile so needsOnboarding flips to false and gate unmounts
            await refreshProfile();
          }}
        />
      </div>
    </div>
  );
}
