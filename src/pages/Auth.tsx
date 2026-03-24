import { useEffect, useState, useRef } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { DiscordIcon } from "@/components/icons/DiscordIcon";
import aeroflotLogo from "@/assets/aeroflot-logo.png";
import aeroflotBanner from "@/assets/aeroflot-banner.jpg";
import vacompanyLogo from "@/assets/vacompany-logo.svg";
import { VACOMPANY_URL } from "@/lib/branding";
import { PolarisFooter } from "@/components/PolarisFooter";
import { PENDING_APPROVAL_MESSAGE } from "@/lib/authMessages";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, pilot, isLoading: isAuthLoading, signIn, signInWithDiscord, signOut } = useAuth();
  
  // Ref to prevent multiple simultaneous OAuth validation runs
  const isValidatingRef = useRef(false);

  const { data: siteSettings } = useQuery({
    queryKey: ["site-settings-auth"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key, value")
        .in("key", ["auth_banner_url", "auth_logo_url"]);
      
      if (error) throw error;
      
      const map: Record<string, string> = {};
      data?.forEach((s) => { if (s.value) map[s.key] = s.value; });
      return map;
    },
    staleTime: 1000 * 60 * 30, // 30 mins
  });

  const bannerSrc = siteSettings?.auth_banner_url || aeroflotBanner;
  const logoSrc = siteSettings?.auth_logo_url || aeroflotLogo;

  useEffect(() => {
    const oauthFlow = searchParams.get("oauth");
    
    // Condition check to stop the effect early
    if (oauthFlow !== "login" || isAuthLoading || !user || isValidatingRef.current) {
      return;
    }

    const validateOAuthApproval = async () => {
      isValidatingRef.current = true;
      
      try {
        const { data: pilotData, error } = await supabase
          .from("pilots")
          .select("approval_status")
          .eq("user_id", user.id)
          .maybeSingle();

        // If pilot exists and is approved, go to dashboard
        if (!error && pilotData?.approval_status === "approved") {
          navigate("/", { replace: true });
          return;
        }

        // If not approved or error, sign out and show message
        await signOut();
        toast.error(PENDING_APPROVAL_MESSAGE);
        navigate("/auth", { replace: true });
      } catch (err) {
        console.error("Auth validation error:", err);
      } finally {
        isValidatingRef.current = false;
      }
    };

    validateOAuthApproval();
  }, [searchParams, isAuthLoading, user, signOut, navigate]);

  // Redirect if user is already logged in and has a pilot profile
  useEffect(() => {
    if (!isAuthLoading && user && pilot && !searchParams.get("oauth")) {
      navigate("/", { replace: true });
    }
  }, [user, pilot, isAuthLoading, navigate, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validation = loginSchema.safeParse({ email, password });
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await signIn(email, password);
      
      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          toast.error("Invalid email or password");
        } else if (error.message.includes("Email not confirmed")) {
          toast.error("Please confirm your email address");
        } else {
          toast.error(error.message);
        }
        return;
      }

      toast.success("Welcome back!");
      navigate("/");
    } catch (err) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDiscordSignIn = async () => {
    setIsLoading(true);
    try {
      const { error } = await signInWithDiscord("/auth?oauth=login");
      if (error) throw error;
      // Note: Redirect happens automatically via Supabase
    } catch (err: any) {
      toast.error(err.message || "Could not start Discord sign in");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left side - Banner (Desktop) */}
      <div className="hidden lg:flex lg:w-3/5 relative overflow-hidden">
        <img 
          src={bannerSrc} 
          alt="Banner" 
          className="absolute inset-0 w-full h-full object-cover" 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="relative z-10 flex flex-col justify-end p-12 text-white">
          <img src={logoSrc} alt="Logo" className="h-16 w-auto object-contain mb-4 self-start" />
          <p className="text-lg opacity-90 max-w-md">
            Professional crew management system for LATOUR Virtual pilots.
          </p>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex flex-col bg-background">
        <div className="flex items-center justify-between p-4">
          <a href={VACOMPANY_URL} target="_blank" rel="noopener noreferrer">
            <img src={vacompanyLogo} alt="VACompany" className="h-8 opacity-80 dark:invert-0 invert" />
          </a>
          <ThemeToggle />
        </div>
        
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="w-full max-w-sm border-none shadow-none lg:shadow-sm lg:border">
            <CardHeader className="space-y-1">
              <div className="lg:hidden mb-6">
                <img src={logoSrc} alt="Logo" className="h-10 w-auto object-contain" />
              </div>
              <CardTitle className="text-2xl font-bold">Sign in</CardTitle>
              <CardDescription>
                Access the LATOUR Crew Center
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <form onSubmit={handleSubmit} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    required
                  />
                </div>
                <Button className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              <Button variant="outline" className="w-full" onClick={handleDiscordSignIn} disabled={isLoading}>
                <DiscordIcon className="mr-2 h-4 w-4" />
                Discord
              </Button>

              <p className="px-8 text-center text-sm text-muted-foreground mt-2">
                New pilot?{" "}
                <Link to="/apply" className="underline underline-offset-4 hover:text-primary">
                  Apply today
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
        <PolarisFooter />
      </div>
    </div>
  );
}
