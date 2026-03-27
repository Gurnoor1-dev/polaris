import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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

  const fetchPilotData = async (userId: string) => {
    try {
      const [pilotRes, roleRes] = await Promise.all([
        supabase.from("pilots").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle()
      ]);

      if (pilotRes.data) {
        setPilot(pilotRes.data);
      } else {
        setPilot(null);
      }
      setIsAdmin(!!roleRes.data);
    } catch (error) {
      console.error("Critical Auth Data Error:", error);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      const forceStopLoading = setTimeout(() => {
        if (isMounted) {
          console.warn("Auth initialization timed out.");
          setIsLoading(false);
        }
      }, 7000);

      try {
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        
        if (error) throw error;

        if (initialSession && isMounted) {
          setSession(initialSession);
          setUser(initialSession.user);
          await fetchPilotData(initialSession.user.id);
        }
      } catch (error) {
        console.error("Auth init failed:", error);
      } finally {
        clearTimeout(forceStopLoading);
        if (isMounted) setIsLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!isMounted) return;

      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      
      if (currentSession?.user) {
        await fetchPilotData(currentSession.user.id);
      } else {
        setPilot(null);
        setIsAdmin(false);
      }
      
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error };

      if (!data.user) return { error: new Error("No user found") };

      // Fetch the pilot record to check approval status
      const { data: p } = await supabase
        .from("pilots")
        .select("approval_status")
        .eq("user_id", data.user.id)
        .maybeSingle();

      // ONLY sign out if the record exists AND it's not approved.
      // If p is null, they haven't applied yet, so let them in to see the Apply page.
      if (p && p.approval_status !== "approved") {
        await supabase.auth.signOut();
        return { error: new Error(PENDING_APPROVAL_MESSAGE) };
      }

      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { error, userId: data.user?.id ?? null };
  };

  const signInWithDiscord = async (path = "/auth", mode: "login" | "register" = "login") => {
    const redirectTo = `${window.location.origin}${path}${path.includes("?") ? "&" : "?"}oauth=${mode}`;
    return await supabase.auth.signInWithOAuth({ 
      provider: "discord", 
      options: { redirectTo } 
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
    <AuthContext.Provider value={{ 
      user, session, pilot, isAdmin, isLoading, isAuthLoading: isLoading,
      signIn, signUp, signInWithDiscord, signOut, refreshPilot: () => fetchPilotData(user?.id || "") 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
