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

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  /**
   * true ONLY for the brief moment Firebase is resolving the persisted
   * auth token on first load (~100-200 ms). Once resolved, this flips to
   * false immediately — profile/following load in the background without
   * blocking the UI.
   */
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]                   = useState<User | null>(null);
  const [profile, setProfile]             = useState<UserProfile | null>(null);
  const [loading, setLoading]             = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [followingCache, setFollowingCache]   = useState<Set<string>>(new Set());
  const [authPromptOpen, setAuthPromptOpen]   = useState(false);

  // ── Profile fetch (non-blocking) ────────────────────────────────────────
  const fetchProfile = useCallback(async (uid: string) => {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        setProfile({ uid: snap.id, ...(snap.data() as Omit<UserProfile, "uid">) });
        setNeedsOnboarding(false);
      } else {
        setProfile(null);
        setNeedsOnboarding(true);
      }
    } catch {
      // Network error — don't crash, leave profile null
    }
  }, []);

  // ── Following cache (non-blocking) ──────────────────────────────────────
  const loadFollowingCache = useCallback(async (uid: string) => {
    try {
      const q = query(collection(db, "follows"), where("followerId", "==", uid));
      const snap = await getDocs(q);
      setFollowingCache(
        new Set(snap.docs.map((d) => d.data().followingId as string))
      );
    } catch {
      // Silently fail — cache stays empty
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.uid);
  }, [user, fetchProfile]);

  const updateFollowingCache = useCallback(
    (targetUid: string, following: boolean) => {
      setFollowingCache((prev) => {
        const next = new Set(prev);
        following ? next.add(targetUid) : next.delete(targetUid);
        return next;
      });
    },
    []
  );

  const requireAuth = useCallback(() => {
    if (!user) setAuthPromptOpen(true);
  }, [user]);

  // ── Auth state listener ──────────────────────────────────────────────────
  // KEY CHANGE: setLoading(false) fires as soon as we know the auth state,
  // NOT after profile/following have loaded. Profile + cache load in parallel
  // in the background — the UI renders immediately with whatever it has.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);

      if (u) {
        // Fire profile + following loads concurrently, don't await them
        fetchProfile(u.uid);
        loadFollowingCache(u.uid);
      } else {
        setProfile(null);
        setNeedsOnboarding(false);
        setFollowingCache(new Set());
      }

      // Auth state is now known — unlock the UI immediately
      setLoading(false);
    });
    return unsub;
  }, [fetchProfile, loadFollowingCache]);

  const login = (email: string, password: string) =>
    signInWithEmailAndPassword(auth, email, password).then(() => undefined);

  const signup = async (email: string, password: string): Promise<User> => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    return cred.user;
  };

  const loginWithGoogle = async (): Promise<{ user: User; isNew: boolean }> => {
    const cred = await signInWithPopup(auth, googleProvider);
    const snap = await getDoc(doc(db, "users", cred.user.uid));
    const isNew = !snap.exists();
    return { user: cred.user, isNew };
  };

  const logout = () => signOut(auth);
  const resetPassword = (email: string) => sendPasswordResetEmail(auth, email);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        needsOnboarding,
        followingCache,
        requireAuth,
        login,
        loginWithGoogle,
        signup,
        logout,
        resetPassword,
        refreshProfile,
        updateFollowingCache,
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
    open: boolean;
    onClose: () => void;
    defaultView: "login" | "signup";
  }> | null>(null);

  useEffect(() => {
    import("@/src/components/auth/AuthModal").then((m) =>
      setModal(() => m.default)
    );
  }, []);

  if (!Modal) return null;
  return <Modal open onClose={onClose} defaultView="login" />;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
