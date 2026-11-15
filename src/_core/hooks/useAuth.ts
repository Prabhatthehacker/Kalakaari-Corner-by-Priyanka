import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "@/firebase";
import { startLogin } from "@/const";
import { isTeacherUser } from "@/lib/teacher";

type UseAuthOptions = { redirectOnUnauthenticated?: boolean; redirectPath?: string };

type AppUser = { id: string; openId: string; name: string | null; email: string | null; role: "admin" | "user"; emailVerified: boolean };

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false } = options ?? {};
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AppUser | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (fbUser: User | null) => {
      if (!fbUser) { setUser(null); setLoading(false); return; }
      try {
        const teacher = await isTeacherUser(fbUser);
        setUser({
          id: fbUser.uid,
          openId: fbUser.uid,
          name: fbUser.displayName || fbUser.email?.split("@")[0] || null,
          email: fbUser.email,
          role: teacher ? "admin" : "user",
          emailVerified: fbUser.emailVerified,
        });
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const logout = useCallback(async () => { await signOut(auth); }, []);

  useEffect(() => {
    if (redirectOnUnauthenticated && !loading && !user) startLogin();
  }, [redirectOnUnauthenticated, loading, user]);

  return useMemo(() => ({
    user,
    loading,
    error,
    isAuthenticated: Boolean(user),
    refresh: async () => { await auth.currentUser?.reload(); },
    logout,
  }), [user, loading, error, logout]);
}
