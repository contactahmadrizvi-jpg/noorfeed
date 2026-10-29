"use client";

import { useState } from "react";
import { useAuth } from "@/src/context/AuthContext";
import { Mail, Loader2, ArrowLeft, CheckCircle } from "lucide-react";

interface Props {
  onBack: () => void;
}

export default function PasswordReset({ onBack }: Props) {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "Failed";
      setError(raw.replace("Firebase: ", "").replace(/\s*\(auth\/.*?\)\.?/, ""));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-4 py-6 text-center">
        <CheckCircle className="mx-auto h-14 w-14 text-emerald-500" />
        <h2 className="text-xl font-bold text-slate-900">Check your email</h2>
        <p className="text-sm text-slate-500">
          A reset link was sent to <strong>{email}</strong>
        </p>
        <button
          onClick={onBack}
          className="text-sm font-semibold text-emerald-600 hover:underline"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div>
        <h2 className="text-2xl font-bold text-slate-900">Reset password</h2>
        <p className="mt-1 text-sm text-slate-500">We'll send a reset link to your email.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <label className="relative block">
        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Send Reset Link
      </button>
    </form>
  );
}
