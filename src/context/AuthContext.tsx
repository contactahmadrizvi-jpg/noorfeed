"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
} from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { auth, db } from "@/src/lib/firebase";
import { UserProfile } from "@/src/types";
import { identifyUser, resetPostHog } from "@/src/lib/posthog";
import { initAlgoliaInsights } from "@/src/lib/algolia";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  needsOnboarding: boolean;
  followingCache: Set<string>;
  requireAuth: () => void;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<{ user: User; isNew: boolean }>;
  signup: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateFollowingCache: (targetUid: string, following: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Mint a server-side session cookie via our API route ───────────────────────
async function mintSessionCookie(user: User): Promise<void> {
  try {
    const idToken = await user.getIdToken();
    await fetch("/api/auth/login", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ idToken }),
    });
  } catch {
    // Non-critical — client-side Firebase auth still works
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]                       = useState<User | null>(null);
  const [profile, setProfile]                 = useState<UserProfile | null>(null);
  const [loading, setLoading]                 = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [followingCache, setFollowingCache]   = useState<Set<string>>(new Set());
  const [authPromptOpen, setAuthPromptOpen]   = useState(false);

  // ── Non-blocking profile fetch ────────────────────────────────────────────
  const fetchProfile = useCallback(async (uid: string) => {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const p = { uid: snap.id, ...(snap.data() as Omit<UserProfile, "uid">) };
        setProfile(p);
        setNeedsOnboarding(false);
        // Identify in PostHog and Algolia Insights for analytics attribution
        identifyUser(uid, { username: p.username, displayName: p.displayName });
        initAlgoliaInsights(uid);
      } else {
        setProfile(null);
        setNeedsOnboarding(true);
      }
    } catch { /* network error — leave profile null */ }
  }, []);

  // ── Non-blocking following cache ──────────────────────────────────────────
  const loadFollowingCache = useCallback(async (uid: string) => {
    try {
      const q = query(collection(db, "follows"), where("followerId", "==", uid));
      const snap = await getDocs(q);
      setFollowingCache(new Set(snap.docs.map((d) => d.data().followingId as string)));
    } catch { /* fail silently */ }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.uid);
  }, [user, fetchProfile]);

  const updateFollowingCache = useCallback((targetUid: string, following: boolean) => {
    setFollowingCache((prev) => {
      const next = new Set(prev);
      following ? next.add(targetUid) : next.delete(targetUid);
      return next;
    });
  }, []);

  const requireAuth = useCallback(() => {
    if (!user) setAuthPromptOpen(true);
  }, [user]);

  // ── Auth listener — unlocks UI immediately, loads data in background ──────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        fetchProfile(u.uid);
        loadFollowingCache(u.uid);
        mintSessionCookie(u); // fire-and-forget — sets __session cookie
      } else {
        setProfile(null);
        setNeedsOnboarding(false);
        setFollowingCache(new Set());
        resetPostHog();
        // Clear the server-side session cookie on sign-out
        fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      }
      setLoading(false);
    });
    return unsub;
  }, [fetchProfile, loadFollowingCache]);

  // ── Auth methods ──────────────────────────────────────────────────────────
  const login = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await mintSessionCookie(cred.user);
  };

  const signup = async (email: string, password: string): Promise<User> => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await mintSessionCookie(cred.user);
    return cred.user;
  };

  const loginWithGoogle = async (): Promise<{ user: User; isNew: boolean }> => {
    const cred = await signInWithPopup(auth, googleProvider);
    await mintSessionCookie(cred.user);
    const snap = await getDoc(doc(db, "users", cred.user.uid));
    return { user: cred.user, isNew: !snap.exists() };
  };

  const logout = async () => {
    await signOut(auth);
    // Cookie cleared by the onAuthStateChanged handler above
  };

  const resetPassword = (email: string) => sendPasswordResetEmail(auth, email);

  return (
    <AuthContext.Provider
      value={{
        user, profile, loading, needsOnboarding, followingCache,
        requireAuth, login, loginWithGoogle, signup,
        logout, resetPassword, refreshProfile, updateFollowingCache,
      }}
    >
      {children}
      {authPromptOpen && (
        <SignInPrompt onClose={() => setAuthPromptOpen(false)} />
      )}
    </AuthContext.Provider>
  );
}

function SignInPrompt({ onClose }: { onClose: () => void }) {
  const [Modal, setModal] = useState<React.ComponentType<{
    open: boolean; onClose: () => void; defaultView: "login" | "signup";
  }> | null>(null);

  useEffect(() => {
    import("@/src/components/auth/AuthModal").then((m) => setModal(() => m.default));
  }, []);

  if (!Modal) return null;
  return <Modal open onClose={onClose} defaultView="login" />;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
