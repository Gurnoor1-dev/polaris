import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { PENDING_APPROVAL_MESSAGE } from "@/lib/authMessages";
import { getDiscordProfile } from "@/lib/discordIdentity";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  pilot: any | null;
  isAdmin: boolean;
  isLoading: boolean;
  isAuthLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string) => Promise<{ error: any; userId: string | null }>;
  signInWithDiscord: (redirectPath?: string, mode?: "login" | "register") => Promise<{ error: any }>;
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
    const { data: pilotData } = await supabase.from("pilots").select("*").eq("user_id", userId).maybeSingle();
    if (pilotData) {
      setPilot(pilotData);
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
      setIsAdmin(!!roleData);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchPilotData(session.user.id);
      } else {
        setPilot(null);
        setIsAdmin(false);
      }
      setIsLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error };
    
    // Manual check for approval status on Email login
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

  const signInWithDiscord = async (path = "/", mode: "login" | "register" = "login") => {
    const redirectTo = `${window.location.origin}${path}${path.includes("?") ? "&" : "?" }oauth=${mode}`;
    return await supabase.auth.signInWithOAuth({ provider: "discord", options: { redirectTo } });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
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
