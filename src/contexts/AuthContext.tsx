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

  // We moved the role check inside fetchPilotData and added error handling
  const fetchPilotData = async (userId: string) => {
    try {
      // Use Promise.all to fetch both simultaneously for speed
      const [pilotRes, roleRes] = await Promise.all([
        supabase.from("pilots").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle()
      ]);

      if (pilotRes.data) setPilot(pilotRes.data);
      setIsAdmin(!!roleRes.data);
    } catch (error) {
      console.error("Critical Auth Data Error:", error);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      // 1. EMERGENCY BREAK: If this takes > 7 seconds, force the app to stop spinning
      const forceStopLoading = setTimeout(() => {
        if (isMounted && isLoading) {
          console.warn("Auth initialization timed out. Forcing UI load.");
          setIsLoading(false);
        }
      }, 7000);

      try {
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        
        if (error) throw error;

        if (initialSession && isMounted) {
          setSession(initialSession);
          setUser(initialSession.user);
          // Don't 'await' this so we can flip isLoading to false faster
          fetchPilotData(initialSession.user.id).finally(() => {
            if (isMounted) setIsLoading(false);
          });
        } else {
          if (isMounted) setIsLoading(false);
        }
      } catch (error) {
        console.error("Auth init failed:", error);
        if (isMounted) setIsLoading(false);
      } finally {
        clearTimeout(forceStopLoading);
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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error };
    
    const { data: p } = await supabase.from("pilots").select("approval_status").eq("user_id", data.user.id).maybeSingle();
    if (p?.approval_status !== "approved") {
      await supabase.auth.signOut();
      return { error: new Error(PENDING_APPROVAL_MESSAGE) };
    }
    return { error: null };
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
