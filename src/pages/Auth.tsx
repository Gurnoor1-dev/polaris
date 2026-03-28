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

  // ✅ Redirect AFTER auth state is ready (FIXES RACE CONDITION)
  useEffect(() => {
    if (!isAuthLoading && user) {
      navigate("/", { replace: true });
    }
  }, [user, isAuthLoading, navigate]);

  const { data: siteSettings } = useQuery({
    queryKey: ["site-settings-auth"],
    queryFn: async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("key, value")
        .in("key", ["auth_banner_url", "auth_logo_url"]);

      const map: Record<string, string> = {};
      data?.forEach((s: any) => {
        if (s.value) map[s.key] = s.value;
      });

      return map;
    },
  });

  const bannerSrc = siteSettings?.auth_banner_url || aeroflotBanner;
  const logoSrc = siteSettings?.auth_logo_url || kevaLogo;

  // ✅ FIXED OAuth handler (no infinite loop)
  useEffect(() => {
    const oauthMode = searchParams.get("oauth");
    const hasToken = window.location.hash.includes("access_token");

    if (!oauthMode && !hasToken) return;

    if (isAuthLoading) return;
    if (!user) return;

    const run = async () => {
      try {
        console.log("Processing Discord OAuth for:", user.email);

        const discordHandle =
          user.user_metadata.preferred_username ||
          user.user_metadata.name ||
          user.email?.split("@")[0];

        const displayName =
          user.user_metadata.full_name || discordHandle;

        const normalized = normalizeDiscordUsername(discordHandle);

        const { data: existingPilot } = await supabase
          .from("pilots")
          .select("*")
          .eq("discord_username", normalized)
          .maybeSingle();

        if (existingPilot) {
          if (!existingPilot.user_id) {
            await supabase
              .from("pilots")
              .update({ user_id: user.id })
              .eq("id", existingPilot.id);
          }

          toast.success(`Welcome back, ${existingPilot.full_name}!`);
          navigate("/", { replace: true });
          return;
        }

        await supabase.from("pilot_applications").upsert({
          user_id: user.id,
          email: user.email,
          full_name: displayName,
          discord_username: normalized,
          status: "pending",
        });

        toast.info(PENDING_APPROVAL_MESSAGE);
        await signOut();
        navigate("/auth", { replace: true });

      } catch (err) {
        console.error("OAuth error:", err);
        setIsLoading(false);
      }
    };

    run();
  }, [searchParams, user, isAuthLoading, navigate, signOut]);

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

      // ❌ DO NOT navigate here (fixed)
    } catch {
      toast.error("Unexpected error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDiscordSignIn = async () => {
    setIsLoading(true);

    try {
      await signInWithDiscord("/auth", "login");
    } catch {
      toast.error("Discord login failed");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-3/5 relative">
        <img src={bannerSrc} className="absolute inset-0 w-full h-full object-cover" />
      </div>

      <div className="flex-1 flex flex-col lg:w-2/5">
        <div className="flex items-center justify-between p-4">
          <a href={VACOMPANY_URL} target="_blank">
            <img src={vacompanyLogo} className="h-10" />
          </a>
          <ThemeToggle />
        </div>

        <div className="flex-1 flex items-center justify-center p-8">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
              <CardDescription>Access the Crew Center</CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                />

                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                />

                <Button disabled={isLoading} className="w-full">
                  {isLoading && <Loader2 className="animate-spin mr-2" />}
                  Sign In
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDiscordSignIn}
                  className="w-full"
                >
                  <DiscordIcon className="mr-2" />
                  Discord
                </Button>

                <p className="text-center text-sm text-muted-foreground">
                  Not a Pilot for KEVA yet?{" "}
                  <Link
                    to="/apply"
                    className="font-medium text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
                  >
                    Apply Now!
                  </Link>
                </p>
              </form>
            </CardContent>
          </Card>
        </div>

        <PolarisFooter />
      </div>
    </div>
  );
}
