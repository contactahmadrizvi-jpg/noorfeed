"use client";

import { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { X } from "lucide-react";
import LoginForm from "./LoginForm";
import SignupForm from "./SignupForm";
import PasswordReset from "./PasswordReset";
import OnboardingForm from "./OnboardingForm";

type View = "login" | "signup" | "reset" | "onboarding";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultView?: "login" | "signup";
}

export default function AuthModal({ open, onClose, defaultView = "login" }: Props) {
  const [view, setView] = useState<View>(defaultView);
  const [pendingUser, setPendingUser] = useState<User | null>(null);

  useEffect(() => {
    if (open) setView(defaultView);
  }, [open, defaultView]);

  if (!open) return null;

  /** Called after email signup — always goes to onboarding */
  const handleEmailSignedUp = (user: User) => {
    setPendingUser(user);
    setView("onboarding");
  };

  /**
   * Called from LoginForm when Google sign-in returns a NEW user
   * (no Firestore profile yet). Existing Google users are closed directly.
   */
  const handleGoogleNeedsOnboarding = (user: User) => {
    setPendingUser(user);
    setView("onboarding");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && view !== "onboarding" && onClose()}
    >
      <div className="relative w-full max-w-md overflow-y-auto rounded-2xl bg-white p-8 shadow-2xl max-h-[90vh]">
        {/* Close — hidden during onboarding */}
        {view !== "onboarding" && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        {/* Brand */}
        <div className="mb-6 flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">☽</span>
          <span className="text-lg font-bold tracking-tight text-emerald-600">NoorFeed</span>
        </div>

        {view === "login" && (
          <LoginForm
            onSwitch={(v) => setView(v)}
            onClose={onClose}
            onNeedsOnboarding={handleGoogleNeedsOnboarding}
          />
        )}

        {view === "signup" && (
          <SignupForm
            onSwitch={(v) => setView(v)}
            onSignedUp={handleEmailSignedUp}
          />
        )}

        {view === "reset" && (
          <PasswordReset onBack={() => setView("login")} />
        )}

        {view === "onboarding" && pendingUser && (
          <OnboardingForm firebaseUser={pendingUser} onComplete={onClose} />
        )}
      </div>
    </div>
  );
}
