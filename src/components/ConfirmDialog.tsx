"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

export default function ConfirmDialog({ title, description, confirmLabel, onConfirm, onClose }: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  useEffect(() => { dialog.current?.showModal(); }, []);
  const close = () => { if (!lock.current) onClose(); };
  async function confirm() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try { await onConfirm(); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : "Something went wrong. Please try again."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onCancel={(e) => { e.preventDefault(); close(); }}
    onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-slate-100 bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm">
    <h2 id={`${id}-title`} className="text-lg font-bold">{title}</h2>
    <p id={`${id}-description`} className="mt-2 text-sm text-slate-500">{description}</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    <div className="mt-6 flex justify-end gap-2">
      <button autoFocus disabled={busy} onClick={close} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">Cancel</button>
      <button disabled={busy} onClick={() => void confirm()} className="flex items-center gap-2 rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50">
        {busy && <Loader2 aria-label="Please wait" className="h-4 w-4 animate-spin" />}{confirmLabel}
      </button>
    </div>
  </dialog>;
}
