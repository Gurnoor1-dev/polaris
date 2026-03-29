import { useEffect, useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Loader2, LogIn, UserPlus, ArrowRight } from "lucide-react";
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

type AuthMode = "choose" | "signin";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [mode, setMode] = useState<AuthMode>("choose");
  const [animating, setAnimating] = useState(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { user, isAuthLoading, signIn, signInWithDiscord, signOut } = useAuth();

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

  useEffect(() => {
    const oauthMode = searchParams.get("oauth");
    const hasToken = window.location.hash.includes("access_token");

    if (!oauthMode && !hasToken) return;
    if (isAuthLoading) return;
    if (!user) return;

    const run = async () => {
      try {
        const discordHandle =
          user.user_metadata.preferred_username ||
          user.user_metadata.name ||
          user.email?.split("@")[0];

        const displayName = user.user_metadata.full_name || discordHandle;
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

  const handleSignInClick = () => {
    setAnimating(true);
    setMode("signin");
    setTimeout(() => setAnimating(false), 600);
  };

  const handleBack = () => {
    setAnimating(true);
    setTimeout(() => {
      setMode("choose");
      setAnimating(false);
    }, 300);
  };

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
    <>
      {/* Keyframe styles */}
      <style>{`
        @keyframes slideInFromRight {
          from {
            opacity: 0;
            transform: translateX(60px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes slideOutToRight {
          from {
            opacity: 1;
            transform: translateX(0);
          }
          to {
            opacity: 0;
            transform: translateX(60px);
          }
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(24px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .slide-in {
          animation: slideInFromRight 0.55s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .slide-out {
          animation: slideOutToRight 0.3s cubic-bezier(0.55, 0, 1, 0.45) forwards;
        }
        .fade-in-up {
          animation: fadeInUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .btn-chooser {
          position: relative;
          overflow: hidden;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .btn-chooser:hover {
          transform: translateY(-2px);
        }
        .btn-chooser::after {
          content: '';
          position: absolute;
          inset: 0;
          background: rgba(255,255,255,0.07);
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        .btn-chooser:hover::after {
          opacity: 1;
        }
      `}</style>

      <div className="min-h-screen flex">
        {/* Banner */}
        <div className="hidden lg:flex lg:w-3/5 relative">
          <img
            src={bannerSrc}
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Subtle overlay so text is always readable */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/10 to-black/30" />
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col lg:w-2/5">
          <div className="flex items-center justify-between p-4">
            <a href={VACOMPANY_URL} target="_blank" rel="noreferrer">
              <img src={vacompanyLogo} className="h-10" alt="VA Company" />
            </a>
            <ThemeToggle />
          </div>

          <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">

            {/* ── CHOOSE MODE ── */}
            {mode === "choose" && (
              <div
                className="w-full max-w-sm space-y-6 fade-in-up"
                key="choose"
              >
                {/* Heading */}
                <div className="text-center space-y-1">
                  <h1 className="text-3xl font-bold tracking-tight">
                    Welcome to KEVA
                  </h1>
                  <p className="text-muted-foreground text-sm">
                    Crew Center — choose how to continue
                  </p>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground uppercase tracking-widest">
                    continue as
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {/* Sign In button */}
                <button
                  onClick={handleSignInClick}
                  className="btn-chooser w-full rounded-xl border border-border bg-card px-5 py-4 flex items-center gap-4 text-left shadow-sm hover:border-[#0066CC]/60 hover:shadow-[0_0_18px_0_rgba(0,102,204,0.18)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0066CC]"
                  style={{ transition: "border-color 0.25s, box-shadow 0.25s, transform 0.2s" }}
                >
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      background: "linear-gradient(135deg, #00256C 0%, #0066CC 100%)",
                    }}
                  >
                    <LogIn className="h-5 w-5 text-white" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-sm">Sign In</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      Access your pilot dashboard
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>

                {/* Sign Up button */}
                <Link
                  to="/apply"
                  className="btn-chooser w-full rounded-xl border border-border bg-card px-5 py-4 flex items-center gap-4 text-left shadow-sm hover:border-[#0066CC]/60 hover:shadow-[0_0_18px_0_rgba(0,102,204,0.18)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0066CC]"
                  style={{ transition: "border-color 0.25s, box-shadow 0.25s, transform 0.2s", display: "flex" }}
                >
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      background: "linear-gradient(135deg, #00256C 0%, #0066CC 100%)",
                    }}
                  >
                    <UserPlus className="h-5 w-5 text-white" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-sm">Sign Up</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      Apply to join the KEVA fleet
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </Link>
              </div>
            )}

            {/* ── SIGN IN MODE ── */}
            {mode === "signin" && (
              <div
                className={`relative w-full max-w-sm ${animating ? "slide-out" : "slide-in"}`}
                key="signin"
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
              >
                {/* Ambient glow — resting */}
                <div
                  style={{
                    position: "absolute",
                    inset: "-2px",
                    borderRadius: "16px",
                    background: "linear-gradient(135deg, #0066CC 0%, #00256C 100%)",
                    opacity: hovered ? 0 : 0.35,
                    filter: "blur(8px)",
                    transition: "opacity 0.7s ease",
                    zIndex: 0,
                  }}
                />
                {/* Hover glow — brighter */}
                <div
                  style={{
                    position: "absolute",
                    inset: "-4px",
                    borderRadius: "16px",
                    background: "linear-gradient(135deg, #00256C 0%, #0066CC 45%, #00256C 100%)",
                    opacity: hovered ? 1 : 0,
                    filter: "blur(14px)",
                    transition: "opacity 0.7s ease",
                    zIndex: 0,
                  }}
                />

                <Card className="relative w-full" style={{ zIndex: 1 }}>
                  <CardHeader className="pb-3 pt-6">
                    <div className="flex items-center gap-2">
                      {/* Back button */}
                      <button
                        onClick={handleBack}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1 -ml-1 rounded-md hover:bg-muted"
                        aria-label="Go back"
                      >
                        <ArrowRight className="h-4 w-4 rotate-180" />
                      </button>
                      <div>
                        <CardTitle className="text-xl leading-tight">Sign in</CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                          Access the Crew Center
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pb-6">
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

                      <p className="text-center text-sm text-muted-foreground pt-1">
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
            )}
          </div>

          <PolarisFooter />
        </div>
      </div>
    </>
  );
}
