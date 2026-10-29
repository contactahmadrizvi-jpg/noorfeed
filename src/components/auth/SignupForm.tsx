"use client";

import { useState } from "react";
import { User } from "firebase/auth";
import { useAuth } from "@/src/context/AuthContext";
import GoogleButton from "./GoogleButton";
import {
  validateEmail,
  validatePasswordStrong,
  validateConfirmPassword,
  getPasswordStrength,
} from "@/src/lib/validators";
import { signupLimit, formatRetryAfter } from "@/src/lib/rateLimiter";
import { Mail, Lock, Loader2, AlertCircle, CheckCircle2, XCircle } from "lucide-react";

interface Props {
  onSwitch: (v: "login") => void;
  onSignedUp: (user: User) => void;
}

interface FieldErrors {
  email?: string;
  password?: string;
  confirm?: string;
}

export default function SignupForm({ onSwitch, onSignedUp }: Props) {
  const { signup } = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState("");
  const [loading, setLoading]   = useState(false);
  const [touched, setTouched]   = useState<Record<string, boolean>>({});
  const [showStrength, setShowStrength] = useState(false);

  const strength = getPasswordStrength(password);

  const validateField = (name: string, value: string) => {
    let err: string | null = null;
    if (name === "email")    err = validateEmail(value);
    if (name === "password") err = validatePasswordStrong(value);
    if (name === "confirm")  err = validateConfirmPassword(password, value);
    setFieldErrors((prev) => ({ ...prev, [name]: err ?? undefined }));
  };

  const handleBlur = (name: string, value: string) => {
    setTouched((prev) => ({ ...prev, [name]: true }));
    validateField(name, value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError("");
    setTouched({ email: true, password: true, confirm: true });

    const emailErr    = validateEmail(email);
    const passwordErr = validatePasswordStrong(password);
    const confirmErr  = validateConfirmPassword(password, confirm);
    setFieldErrors({
      email: emailErr ?? undefined,
      password: passwordErr ?? undefined,
      confirm: confirmErr ?? undefined,
    });
    if (emailErr || passwordErr || confirmErr) return;

    const limit = signupLimit();
    if (!limit.allowed) {
      setGlobalError(
        `Too many signups. Try again in ${formatRetryAfter(limit.retryAfterSeconds!)}.`
      );
      return;
    }

    setLoading(true);
    try {
      const user = await signup(email.trim(), password);
      onSignedUp(user);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "Signup failed";
      const clean = raw.replace("Firebase: ", "").replace(/\s*\(auth\/.*?\)\.?/, "");
      if (clean.includes("email-already-in-use")) {
        setFieldErrors((prev) => ({ ...prev, email: "This email is already registered." }));
      } else if (clean.includes("invalid-email")) {
        setFieldErrors((prev) => ({ ...prev, email: "Invalid email address." }));
      } else if (clean.includes("weak-password")) {
        setFieldErrors((prev) => ({ ...prev, password: "Password is too weak." }));
      } else {
        setGlobalError(clean);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = (user: User, _isNew: boolean) => onSignedUp(user);

  const inputClass = (name: keyof FieldErrors) =>
    `w-full rounded-xl border py-3 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 outline-none transition ${
      touched[name] && fieldErrors[name]
        ? "border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-400/20"
        : "border-slate-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
    }`;

  // Password requirement checklist
  const requirements = [
    { label: "At least 8 characters",      met: password.length >= 8 },
    { label: "One uppercase letter",        met: /[A-Z]/.test(password) },
    { label: "One number",                  met: /[0-9]/.test(password) },
  ];

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Create account</h2>
        <p className="mt-1 text-sm text-slate-500">Join the NoorFeed community</p>
      </div>

      {globalError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {globalError}
        </div>
      )}

      <GoogleButton label="Sign up with Google" onSuccess={handleGoogleSuccess} onError={setGlobalError} />

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
      <div className="space-y-2">
        <label className="relative block">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="password"
            placeholder="Password"
            value={password}
            autoComplete="new-password"
            onChange={(e) => {
              setPassword(e.target.value);
              setShowStrength(true);
              if (touched.password) validateField("password", e.target.value);
              if (touched.confirm) validateField("confirm", confirm);
            }}
            onBlur={() => handleBlur("password", password)}
            className={inputClass("password")}
          />
        </label>

        {/* Strength meter — appears once user starts typing */}
        {showStrength && password.length > 0 && (
          <div className="space-y-2">
            {/* Bar */}
            <div className="flex gap-1">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                    i < strength.score ? strength.barColor : "bg-slate-100"
                  }`}
                />
              ))}
            </div>
            <p className={`text-xs font-medium ${strength.color}`}>{strength.label}</p>

            {/* Requirements checklist */}
            <div className="space-y-1">
              {requirements.map(({ label, met }) => (
                <div key={label} className="flex items-center gap-1.5">
                  {met ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                  )}
                  <span className={`text-xs ${met ? "text-emerald-600" : "text-slate-400"}`}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {touched.password && fieldErrors.password && (
          <p className="pl-1 text-xs text-red-500">{fieldErrors.password}</p>
        )}
      </div>

      {/* Confirm password */}
      <div className="space-y-1">
        <label className="relative block">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            autoComplete="new-password"
            onChange={(e) => { setConfirm(e.target.value); if (touched.confirm) validateField("confirm", e.target.value); }}
            onBlur={() => handleBlur("confirm", confirm)}
            className={inputClass("confirm")}
          />
        </label>
        {touched.confirm && fieldErrors.confirm && (
          <p className="pl-1 text-xs text-red-500">{fieldErrors.confirm}</p>
        )}
        {touched.confirm && !fieldErrors.confirm && confirm && (
          <p className="flex items-center gap-1 pl-1 text-xs text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> Passwords match
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Create Account
      </button>

      <p className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <button type="button" onClick={() => onSwitch("login")} className="font-semibold text-emerald-600 hover:underline">
          Sign in
        </button>
      </p>
    </form>
  );
}
