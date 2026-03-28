import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { PENDING_APPROVAL_MESSAGE } from "@/lib/authMessages";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  pilot: any | null;
  isAdmin: boolean;
  isLoading: boolean;
  isAuthLoading: boolean;
  isPilotLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string) => Promise<{ error: any; userId: string | null }>;
  signInWithDiscord: (path?: string, mode?: "login" | "register") => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshPilot: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [pilot, setPilot] = useState<any | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // isLoading = true until we know whether a session exists (auth check only)
  const [isLoading, setIsLoading] = useState(true);
  // isPilotLoading = true while we're fetching the pilots row
  const [isPilotLoading, setIsPilotLoading] = useState(false);
  const isMounted = useRef(true);

  const fetchPilotData = async (userId: string) => {
    if (!isMounted.current) return;
    setIsPilotLoading(true);
    try {
      const [pilotRes, roleRes] = await Promise.all([
        supabase.from("pilots").select("*").eq("user_id", userId).maybeSingle(),
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle(),
      ]);

      if (!isMounted.current) return;

      setPilot(pilotRes.data ?? null);
      setIsAdmin(!!roleRes.data);
    } catch (error) {
      console.error("fetchPilotData error:", error);
      if (isMounted.current) setPilot(null);
    } finally {
      if (isMounted.current) setIsPilotLoading(false);
    }
  };

  useEffect(() => {
    isMounted.current = true;

    // Hard timeout: if Supabase takes > 8s, unblock the UI
    const forceUnblock = setTimeout(() => {
      if (isMounted.current) {
        console.warn("Auth init timed out — unblocking UI");
        setIsLoading(false);
        setIsPilotLoading(false);
      }
    }, 8000);

    const initializeAuth = async () => {
      try {
        const {
          data: { session: initialSession },
          error,
        } = await supabase.auth.getSession();

        if (error) throw error;

        if (initialSession && isMounted.current) {
          setSession(initialSession);
          setUser(initialSession.user);
          // Fetch pilot BEFORE marking auth as ready so ProtectedRoute
          // never sees a flash of "no pilot" while we're still loading.
          await fetchPilotData(initialSession.user.id);
        }
      } catch (err) {
        console.error("Auth init error:", err);
      } finally {
        clearTimeout(forceUnblock);
        if (isMounted.current) setIsLoading(false);
      }
    };

    initializeAuth();

    // Listen for sign-in / sign-out events that happen AFTER init
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!isMounted.current) return;

      // Only handle events AFTER the initial load is done, to avoid
      // double-fetching pilot data on startup.
      if (isLoading) return;

      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        await fetchPilotData(currentSession.user.id);
      } else {
        setPilot(null);
        setIsAdmin(false);
      }
    });

    return () => {
      isMounted.current = false;
      subscription.unsubscribe();
      clearTimeout(forceUnblock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) return { error };
      if (!data.user) return { error: new Error("No user returned") };

      // Check approval status
      const { data: p, error: pError } = await supabase
        .from("pilots")
        .select("approval_status")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (pError) return { error: pError };

      if (p && p.approval_status !== "approved") {
        await supabase.auth.signOut();
        return { error: new Error(PENDING_APPROVAL_MESSAGE) };
      }

      // Fetch pilot data immediately after sign-in so the app is ready
      await fetchPilotData(data.user.id);
      setUser(data.user);
      setSession(data.session);

      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { error, userId: data.user?.id ?? null };
  };

  const signInWithDiscord = async (
    path = "/auth",
    mode: "login" | "register" = "login"
  ) => {
    const redirectTo = `${window.location.origin}${path}${
      path.includes("?") ? "&" : "?"
    }oauth=${mode}`;
    return await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setPilot(null);
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        pilot,
        isAdmin,
        isLoading,
        isAuthLoading: isLoading,
        isPilotLoading,
        signIn,
        signUp,
        signInWithDiscord,
        signOut,
        refreshPilot: () => fetchPilotData(user?.id || ""),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
