import { useEffect, useState } from "react";
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
import kevaLogo from "@/assets/aeroflot-logo.png";
import aeroflotBanner from "@/assets/aeroflot-banner.jpg";
import vacompanyLogo from "@/assets/vacompany-logo.svg";
import { VACOMPANY_URL } from "@/lib/branding";
import { PolarisFooter } from "@/components/PolarisFooter";
import { PENDING_APPROVAL_MESSAGE } from "@/lib/authMessages";
import { normalizeDiscordUsername } from "@/lib/discordIdentity";

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
  const { user, isAuthLoading, signIn, signInWithDiscord, signOut } = useAuth();

  const { data: siteSettings } = useQuery({
    queryKey: ["site-settings-auth"],
    queryFn: async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("key, value")
        .in("key", ["auth_banner_url", "auth_logo_url"]);
      const map: Record<string, string> = {};
      data?.forEach((s: any) => { if (s.value) map[s.key] = s.value; });
      return map;
    },
  });

  const bannerSrc = siteSettings?.auth_banner_url || aeroflotBanner;
  const logoSrc = siteSettings?.auth_logo_url || kevaLogo;

  useEffect(() => {
    const oauthFlow = searchParams.get("oauth");
    if (oauthFlow !== "login" || isAuthLoading || !user) return;

    const handleDiscordAuthMapping = async () => {
      console.log("Discord Auth Callback Triggered for:", user.email);
      
      try {
        // 1. Extract Discord Info with robust fallbacks
        const discordHandle = user.user_metadata.preferred_username || user.user_metadata.name || user.email?.split('@')[0];
        const discordDisplayName = user.user_metadata.custom_claims?.global_name || user.user_metadata.full_name || discordHandle;
        const normalizedHandle = normalizeDiscordUsername(discordHandle);

        // 2. Check if this username exists in the Pilots table
        const { data: existingPilot } = await supabase
          .from("pilots")
          .select("*")
          .eq("discord_username", normalizedHandle)
          .maybeSingle();

        if (existingPilot) {
          if (!existingPilot.user_id) {
            await supabase.from("pilots").update({ user_id: user.id }).eq("id", existingPilot.id);
          }
          toast.success(`Welcome back, ${existingPilot.full_name}!`);
          navigate("/", { replace: true });
          return;
        }

        // 3. Automated Application Submission
        // Fills all required schema columns with "Discord" or default values
        const { error: appError } = await supabase.from("pilot_applications").upsert({
          user_id: user.id,
          email: user.email,
          full_name: discordDisplayName,
          discord_username: normalizedHandle,
          status: "pending",
          experience_level: "Grade 2",
          preferred_simulator: "Discord",
          reason_for_joining: "Discord Quick Apply",
          ifc_profile_url: "Discord",
          other_va_membership: "Discord",
          hear_about_aflv: "Discord Auth Redirect",
          age_range: "Discord",
          if_grade: "Grade 2",
          is_ifatc: "No",
          ifc_trust_level: "I don't know"
        }, { onConflict: "user_id" });

        if (appError) {
          console.error("DATABASE REJECTION:", appError.message, appError.details);
          toast.error("An error occurred while linking your Discord account. Check console for details.");
        } else {
          toast.info(PENDING_APPROVAL_MESSAGE, { duration: 6000 });
        }
        
        await signOut();
        navigate("/auth", { replace: true });
      } catch (err) {
        console.error("OAuth Flow Crash:", err);
        toast.error("Internal authentication error.");
      }
    };

    handleDiscordAuthMapping();
  }, [searchParams, isAuthLoading, user, navigate, signOut]);

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
        toast.error(error.message);
        return;
      }
      navigate("/");
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDiscordSignIn = async () => {
    setIsLoading(true);
    try {
      await signInWithDiscord("/auth", "login");
    } catch {
      toast.error("Could not start Discord sign in");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-3/5 relative">
        <img src={bannerSrc} className="absolute inset-0 w-full h-full object-cover" alt="Banner" />
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
        <div className="relative z-10 flex flex-col justify-end p-12">
          <img src={logoSrc} className="h-16 w-auto object-contain mb-4" alt="Logo" />
          <p className="text-lg text-foreground/90 max-w-md">Professional crew management for Korean Air Virtual.</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:w-2/5">
        <div className="flex items-center justify-between p-4">
          <a href={VACOMPANY_URL} target="_blank" rel="noopener noreferrer">
            <img src={vacompanyLogo} alt="VACompany" className="h-10 w-auto opacity-80 invert dark:invert-0" />
          </a>
          <ThemeToggle />
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle className="text-2xl">Sign in</CardTitle>
              <CardDescription>Access the Crew Center</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Sign In
                </Button>
                <div className="relative py-2 text-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                  <hr className="mt-[-8px]" />
                </div>
                <Button type="button" variant="outline" className="w-full" onClick={handleDiscordSignIn}>
                  <DiscordIcon className="mr-2 h-4 w-4" /> Continue with Discord
                </Button>
              </form>
              <div className="mt-6 text-center text-sm">
                <span className="text-muted-foreground">New? </span>
                <Link to="/apply" className="text-primary hover:underline font-medium">Apply now</Link>
              </div>
            </CardContent>
          </Card>
        </div>
        <PolarisFooter />
      </div>
    </div>
  );
}
