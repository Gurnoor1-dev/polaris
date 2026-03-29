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
  const [isLoading, setIsLoading] = useState(true);
  const [isPilotLoading, setIsPilotLoading] = useState(false);
  const isMounted = useRef(true);
  // Use a ref to track init status so the auth listener
  // can read the CURRENT value without a stale closure.
  const initDoneRef = useRef(false);

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
    initDoneRef.current = false;

    const forceUnblock = setTimeout(() => {
      if (isMounted.current) {
        console.warn("Auth init timed out — unblocking UI");
        initDoneRef.current = true;
        setIsLoading(false);
        setIsPilotLoading(false);
      }
    }, 8000);

    // Set up the listener BEFORE calling getSession so we never miss an event.
    // We guard with initDoneRef (a ref, not state) to avoid the stale closure
    // that was causing the listener to always bail out early.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!isMounted.current) return;

      // Drop events that fire during initial load — initializeAuth handles those.
      if (!initDoneRef.current) return;

      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        await fetchPilotData(currentSession.user.id);
      } else {
        setPilot(null);
        setIsAdmin(false);
      }
    });

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
          await fetchPilotData(initialSession.user.id);
        }
      } catch (err) {
        console.error("Auth init error:", err);
      } finally {
        clearTimeout(forceUnblock);
        if (isMounted.current) {
          // Mark init done BEFORE flipping isLoading so the listener
          // is armed the instant React re-renders with isLoading=false.
          initDoneRef.current = true;
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    return () => {
      isMounted.current = false;
      subscription.unsubscribe();
      clearTimeout(forceUnblock);
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) return { error };
      if (!data.user) return { error: new Error("No user returned") };

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
