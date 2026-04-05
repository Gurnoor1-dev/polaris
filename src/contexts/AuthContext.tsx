import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
} from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { PENDING_APPROVAL_MESSAGE } from "@/lib/authMessages";

interface Pilot {
  [key: string]: any;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  pilot: Pilot | null;
  isAdmin: boolean;
  isLoading: boolean;
  isAuthLoading: boolean;
  isPilotLoading: boolean;
  isReady: boolean;
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
  const [pilot, setPilot] = useState<Pilot | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPilotLoading, setIsPilotLoading] = useState(true);

  const initialBootDone = useRef(false);
  const isMounted = useRef(true);

  const fetchPilotData = async (
    userId: string,
    isInitial = false
  ): Promise<boolean> => {
    if (!isMounted.current) return false;
    if (isInitial) setIsPilotLoading(true);

    try {
      const [pilotRes, roleRes] = await Promise.all([
        supabase
          .from("pilots")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle(),
      ]);

      if (!isMounted.current) return false;

      const pilotData = pilotRes.data ?? null;

      if (pilotData && pilotData.approval_status !== "approved") {
        console.warn(
          `User ${userId} has approval_status="${pilotData.approval_status}" — signing out.`
        );
        await supabase.auth.signOut();
        if (isMounted.current) {
          setSession(null);
          setUser(null);
          setPilot(null);
          setIsAdmin(false);
        }
        return false;
      }

      setPilot(pilotData);
      setIsAdmin(!!roleRes.data);
      return true;
    } catch (error) {
      console.error("fetchPilotData error:", error);
      if (isMounted.current && isInitial) setPilot(null);
      return false;
    } finally {
      if (isMounted.current && isInitial) {
        setIsPilotLoading(false);
      }
    }
  };

  useEffect(() => {
    isMounted.current = true;

    const forceUnblock = setTimeout(() => {
      if (isMounted.current && !initialBootDone.current) {
        console.warn("Auth init timed out — unblocking UI");
        initialBootDone.current = true;
        setIsLoading(false);
        setIsPilotLoading(false);
      }
    }, 5000);

    const initializeAuth = async () => {
      try {
        const {
          data: { session: initialSession },
          error,
        } = await supabase.auth.getSession();

        if (error) throw error;

        if (initialSession?.user && isMounted.current) {
          setSession(initialSession);
          setUser(initialSession.user);
          await fetchPilotData(initialSession.user.id, true);
        } else {
          if (isMounted.current) setIsPilotLoading(false);
        }
      } catch (err) {
        console.error("Auth init error:", err);
        if (isMounted.current) setIsPilotLoading(false);
      } finally {
        clearTimeout(forceUnblock);
        if (isMounted.current) {
          initialBootDone.current = true;
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!isMounted.current) return;
      if (!initialBootDone.current) return;

      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setSession(currentSession);
        if (currentSession?.user) {
          await fetchPilotData(currentSession.user.id, false);
        }
        return;
      }

      if (event === "SIGNED_OUT") {
        setSession(null);
        setUser(null);
        setPilot(null);
        setIsAdmin(false);
        return;
      }

      if (event === "SIGNED_IN" && currentSession?.user) {
        setSession(currentSession);
        setUser(currentSession.user);
        await fetchPilotData(currentSession.user.id, false);
        return;
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

      setUser(data.user);
      setSession(data.session);
      await fetchPilotData(data.user.id, false);

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

  // ✅ isReady is true only when both loading phases are complete
  const isReady = !isLoading && !isPilotLoading;

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
        isReady,
        signIn,
        signUp,
        signInWithDiscord,
        signOut,
        refreshPilot: () => fetchPilotData(user?.id || "", false),
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
