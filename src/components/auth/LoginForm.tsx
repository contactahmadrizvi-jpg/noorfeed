"use client";

import { useState } from "react";
import { User } from "firebase/auth";
import { useAuth } from "@/src/context/AuthContext";
import GoogleButton from "./GoogleButton";
import { validateEmail, validatePassword } from "@/src/lib/validators";
import { loginLimit, formatRetryAfter } from "@/src/lib/rateLimiter";
import { Mail, Lock, Loader2, AlertCircle } from "lucide-react";

interface Props {
  onSwitch: (v: "signup" | "reset") => void;
  onClose: () => void;
  onNeedsOnboarding: (user: User) => void;
}

interface FieldErrors {
  email?: string;
  password?: string;
}

export default function LoginForm({ onSwitch, onClose, onNeedsOnboarding }: Props) {
  const { login } = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState("");
  const [loading, setLoading]   = useState(false);
  const [touched, setTouched]   = useState<Record<string, boolean>>({});

  // ── Real-time field validation ──────────────────────────────────────────
  const validateField = (name: string, value: string) => {
    let err: string | null = null;
    if (name === "email")    err = validateEmail(value);
    if (name === "password") err = validatePassword(value);
    setFieldErrors((prev) => ({ ...prev, [name]: err ?? undefined }));
  };

  const handleBlur = (name: string, value: string) => {
    setTouched((prev) => ({ ...prev, [name]: true }));
    validateField(name, value);
  };

  const isFormValid =
    !validateEmail(email) && !validatePassword(password);

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError("");

    // Mark all fields touched to show errors
    setTouched({ email: true, password: true });
    const emailErr    = validateEmail(email);
    const passwordErr = validatePassword(password);
    if (emailErr || passwordErr) {
      setFieldErrors({ email: emailErr ?? undefined, password: passwordErr ?? undefined });
      return;
    }

    // Rate limit keyed to email so each account has its own bucket
    const limit = loginLimit(email.toLowerCase().trim());
    if (!limit.allowed) {
      setGlobalError(
        `Too many attempts. Try again in ${formatRetryAfter(limit.retryAfterSeconds!)}.`
      );
      return;
    }

    setLoading(true);
    try {
      await login(email.trim(), password);
      onClose();
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "Login failed";
      const clean = raw.replace("Firebase: ", "").replace(/\s*\(auth\/.*?\)\.?/, "");
      // Map Firebase codes to friendly messages
      if (clean.includes("user-not-found") || clean.includes("wrong-password") || clean.includes("invalid-credential")) {
        setGlobalError("Incorrect email or password.");
      } else if (clean.includes("too-many-requests")) {
        setGlobalError("Account temporarily locked. Reset your password or try later.");
      } else if (clean.includes("user-disabled")) {
        setGlobalError("This account has been disabled. Contact support.");
      } else {
        setGlobalError(clean);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = (user: User, isNew: boolean) => {
    if (isNew) onNeedsOnboarding(user);
    else onClose();
  };

  const inputClass = (name: string) =>
    `w-full rounded-xl border py-3 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 outline-none transition ${
      touched[name] && fieldErrors[name as keyof FieldErrors]
        ? "border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-400/20"
        : "border-slate-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
    }`;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
        <p className="mt-1 text-sm text-slate-500">Sign in to NoorFeed</p>
      </div>

      {globalError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {globalError}
        </div>
      )}

      <GoogleButton label="Sign in with Google" onSuccess={handleGoogleSuccess} onError={setGlobalError} />

      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-slate-100" />
        <span className="text-xs text-slate-400">or continue with email</span>
        <div className="flex-1 border-t border-slate-100" />
      </div>

      {/* Email */}
      <div className="space-y-1">
        <label className="relative block">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="email"
            placeholder="Email address"
            value={email}
            autoComplete="email"
            onChange={(e) => { setEmail(e.target.value); if (touched.email) validateField("email", e.target.value); }}
            onBlur={() => handleBlur("email", email)}
            className={inputClass("email")}
          />
        </label>
        {touched.email && fieldErrors.email && (
          <p className="pl-1 text-xs text-red-500">{fieldErrors.email}</p>
        )}
      </div>

      {/* Password */}
      <div className="space-y-1">
        <label className="relative block">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="password"
            placeholder="Password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => { setPassword(e.target.value); if (touched.password) validateField("password", e.target.value); }}
            onBlur={() => handleBlur("password", password)}
            className={inputClass("password")}
          />
        </label>
        {touched.password && fieldErrors.password && (
          <p className="pl-1 text-xs text-red-500">{fieldErrors.password}</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => onSwitch("reset")}
        className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
      >
        Forgot password?
      </button>

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Sign In
      </button>

      <p className="text-center text-sm text-slate-500">
        No account?{" "}
        <button type="button" onClick={() => onSwitch("signup")} className="font-semibold text-emerald-600 hover:underline">
          Join NoorFeed
        </button>
      </p>
    </form>
  );
}
