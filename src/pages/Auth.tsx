import { useEffect, useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Loader2, LogIn, UserPlus, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { DiscordIcon } from "@/components/icons/DiscordIcon";
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
  const [hovered, setHovered] = useState(false);
  // Controls whether the login card is slid in or out
  const [signinVisible, setSigninVisible] = useState(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isAuthLoading, signIn, signInWithDiscord, signOut } = useAuth();

  useEffect(() => {
    if (!isAuthLoading && user) navigate("/", { replace: true });
  }, [user, isAuthLoading, navigate]);

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

  useEffect(() => {
    const oauthMode = searchParams.get("oauth");
    const hasToken = window.location.hash.includes("access_token");
    if (!oauthMode && !hasToken) return;
    if (isAuthLoading || !user) return;

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
      if (error) toast.error(error.message);
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
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .chooser-enter {
          animation: fadeInUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .chooser-btn {
          transition: border-color 0.25s, box-shadow 0.25s, transform 0.2s;
        }
        .chooser-btn:hover {
          transform: translateY(-2px);
          border-color: rgba(0, 102, 204, 0.6);
          box-shadow: 0 0 20px 0 rgba(0, 102, 204, 0.2);
        }
      `}</style>

      <div className="min-h-screen flex">
        {/* ── Left banner ── */}
        <div className="hidden lg:flex lg:w-3/5 relative overflow-hidden">
          <img
            src={bannerSrc}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/10 to-black/30" />
        </div>

        {/* ── Right panel — overflow hidden so the card slides in from outside ── */}
        <div
          className="flex-1 flex flex-col lg:w-2/5"
          style={{ overflow: "hidden" }}
        >
          <div className="flex items-center justify-between p-4">
            <a href={VACOMPANY_URL} target="_blank" rel="noreferrer">
              <img src={vacompanyLogo} className="h-10" alt="VA" />
            </a>
            <ThemeToggle />
          </div>

          {/*
            Sliding stage:
            - Both "choose" and "signin" live in a flex row
            - The row is 200% wide; each panel is 100% of the parent
            - translateX(-50%) moves to the signin panel
            - overflow:hidden on the parent clips everything outside
          */}
          <div className="flex-1 flex flex-col" style={{ position: "relative", overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                width: "200%",
                height: "100%",
                transform: signinVisible ? "translateX(-50%)" : "translateX(0%)",
                transition: "transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              {/* ── Panel 1: Choose ── */}
              <div
                style={{ width: "50%", height: "100%" }}
                className="flex items-center justify-center p-8"
              >
                <div className="w-full max-w-sm space-y-6 chooser-enter">
                  {/* Heading */}
                  <div className="text-center space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight">
                      Welcome to KEVA
                    </h1>
                    <p className="text-muted-foreground text-sm">
                      Crew Center — choose how to continue
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground uppercase tracking-widest">
                      continue as
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  {/* Sign In */}
                  <button
                    onClick={() => setSigninVisible(true)}
                    className="chooser-btn w-full rounded-xl border border-border bg-card px-5 py-4 flex items-center gap-4 text-left shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0066CC]"
                  >
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        background:
                          "linear-gradient(135deg, #00256C 0%, #0066CC 100%)",
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

                  {/* Sign Up */}
                  <Link
                    to="/apply"
                    className="chooser-btn w-full rounded-xl border border-border bg-card px-5 py-4 flex items-center gap-4 text-left shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0066CC]"
                    style={{ display: "flex" }}
                  >
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        background:
                          "linear-gradient(135deg, #00256C 0%, #0066CC 100%)",
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
              </div>

              {/* ── Panel 2: Sign In card ── */}
              <div
                style={{ width: "50%", height: "100%" }}
                className="flex items-center justify-center p-8"
              >
                <div
                  className="relative w-full max-w-sm"
                  onMouseEnter={() => setHovered(true)}
                  onMouseLeave={() => setHovered(false)}
                >
                  {/* Ambient glow */}
                  <div
                    style={{
                      position: "absolute",
                      inset: "-2px",
                      borderRadius: "16px",
                      background:
                        "linear-gradient(135deg, #0066CC 0%, #00256C 100%)",
                      opacity: hovered ? 0 : 0.35,
                      filter: "blur(8px)",
                      transition: "opacity 0.7s ease",
                      zIndex: 0,
                    }}
                  />
                  {/* Hover glow */}
                  <div
                    style={{
                      position: "absolute",
                      inset: "-4px",
                      borderRadius: "16px",
                      background:
                        "linear-gradient(135deg, #00256C 0%, #0066CC 45%, #00256C 100%)",
                      opacity: hovered ? 1 : 0,
                      filter: "blur(14px)",
                      transition: "opacity 0.7s ease",
                      zIndex: 0,
                    }}
                  />

                  <Card className="relative w-full" style={{ zIndex: 1 }}>
                    <CardHeader className="pb-3 pt-6">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSigninVisible(false)}
                          className="text-muted-foreground hover:text-foreground transition-colors p-1 -ml-1 rounded-md hover:bg-muted"
                          aria-label="Go back"
                        >
                          <ArrowRight className="h-4 w-4 rotate-180" />
                        </button>
                        <div>
                          <CardTitle className="text-xl leading-tight">
                            Sign in
                          </CardTitle>
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
                          {isLoading && (
                            <Loader2 className="animate-spin mr-2" />
                          )}
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
              </div>
            </div>
          </div>

          <PolarisFooter />
        </div>
      </div>
    </>
  );
}
