import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { DiscordIcon } from "@/components/icons/DiscordIcon";
import aeroflotLogo from "@/assets/aeroflot-logo.png";
import { PolarisFooter } from "@/components/PolarisFooter";
import { getDiscordProfile, normalizeDiscordUsername } from "@/lib/discordIdentity";

const applicationSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  discordUsername: z.string().min(2, "Discord username is required"),
  ifGrade: z.string(),
  isIfatc: z.string(),
  ifcTrustLevel: z.string(),
  ageRange: z.string(),
  ifcProfileUrl: z.string().min(2, "IFC username is required"),
  otherVaMembership: z.string().min(2, "Please answer if you are a member of another VA or VO"),
  whyJoinLatour: z.string().min(10, "Please share why you want to join"),
  hearAboutLatour: z.string().min(2, "Please share where you heard about us"),
});

export default function ApplyPage() {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    discordUsername: "",
    ifGrade: "Grade 2",
    isIfatc: "No",
    ifcTrustLevel: "I don't know",
    ageRange: "13-16",
    ifcProfileUrl: "",
    otherVaMembership: "",
    whyJoinLatour: "",
    hearAboutLatour: "",
  });

  const [isLoading, setIsLoading] = useState(false);
  const { user, signUp, signIn, signInWithDiscord, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isDiscordRegisterFlow = searchParams.get("oauth") === "register";
  const hasCheckedExisting = useRef(false);

  // 1. If a user lands here without OAuth and is logged in, sign them out 
  // unless they are currently mid-registration.
  useEffect(() => {
    if (user && !isDiscordRegisterFlow && !hasCheckedExisting.current) {
      signOut();
    }
  }, [user, isDiscordRegisterFlow, signOut]);

  // 2. Pre-fill data from Discord if available
  useEffect(() => {
    if (user && isDiscordRegisterFlow) {
      const { discordUsername: dName } = getDiscordProfile(user);
      const metadata = user.user_metadata || {};
      
      setFormData(prev => ({
        ...prev,
        email: user.email || metadata.email || prev.email,
        fullName: metadata.full_name || metadata.name || metadata.global_name || prev.fullName,
        discordUsername: dName || prev.discordUsername
      }));
    }
  }, [user, isDiscordRegisterFlow]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const validation = applicationSchema.safeParse(formData);
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      setIsLoading(false);
      return;
    }

    try {
      let currentUserId = user?.id;
      let currentEmail = formData.email;

      // STEP 1: Handle Authentication
      if (!isDiscordRegisterFlow && !user) {
        const { error: signUpError, userId } = await signUp(formData.email, formData.password);

        if (signUpError) {
          // If user exists but app failed previously, try to sign in to finish the app
          if (signUpError.message.includes("already registered")) {
            const { error: signInError } = await signIn(formData.email, formData.password);
            if (signInError) {
              toast.error("Account exists. Please log in to complete your application.");
              navigate("/auth");
              return;
            }
            // If sign in worked, we now have a user object in context
          } else {
            throw signUpError;
          }
        }
        currentUserId = userId || (await supabase.auth.getUser()).data.user?.id;
      }

      if (!currentUserId) throw new Error("Could not establish user session.");

      // STEP 2: Handle Discord Data
      const { discordUserId } = getDiscordProfile(user);
      const normalizedDiscord = normalizeDiscordUsername(formData.discordUsername);

      // STEP 3: Submit/Upsert Application
      const { error: appError } = await supabase.from("pilot_applications").upsert({
        user_id: currentUserId,
        email: currentEmail,
        full_name: formData.fullName,
        experience_level: formData.ifGrade,
        preferred_simulator: formData.isIfatc, // Mapping to existing schema col
        reason_for_joining: formData.whyJoinLatour,
        discord_username: normalizedDiscord,
        discord_user_id: discordUserId,
        if_grade: formData.ifGrade,
        is_ifatc: formData.isIfatc,
        ifc_trust_level: formData.ifcTrustLevel,
        age_range: formData.ageRange,
        ifc_profile_url: formData.ifcProfileUrl.trim().replace(/^@+/, ""),
        other_va_membership: formData.otherVaMembership,
        hear_about_aflv: formData.hearAboutLatour,
        status: 'pending'
      }, { onConflict: 'user_id' });

      if (appError) throw appError;

      toast.success("Application submitted! Please wait for staff approval.");
      await signOut(); // Clear session so they don't enter dashboard unapproved
      navigate("/auth", { replace: true });

    } catch (err: any) {
      console.error("Submission error:", err);
      toast.error(err.message || "An error occurred during submission.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDiscordRegister = async () => {
    setIsLoading(true);
    const { error } = await signInWithDiscord("/apply", "register");
    if (error) {
      toast.error(error.message);
      setIsLoading(false);
    }
  };

  const updateField = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex justify-between items-center p-4">
        <Link to="/auth" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to login
        </Link>
        <ThemeToggle />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl border-none md:border shadow-none md:shadow-sm">
          <CardHeader className="text-center">
            <img src={aeroflotLogo} alt="Logo" className="h-12 w-auto mx-auto mb-4" />
            <CardTitle className="text-2xl">Join Korean Air Virtual</CardTitle>
            <CardDescription>Infinite Flight Pilot Application</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Full Name *</Label>
                  <Input value={formData.fullName} onChange={e => updateField("fullName", e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input type="email" value={formData.email} onChange={e => updateField("email", e.target.value)} readOnly={isDiscordRegisterFlow} required />
                </div>
                {!isDiscordRegisterFlow && (
                  <div className="space-y-2 md:col-span-2">
                    <Label>Password *</Label>
                    <Input type="password" value={formData.password} onChange={e => updateField("password", e.target.value)} required />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Discord Username *</Label>
                  <Input value={formData.discordUsername} onChange={e => updateField("discordUsername", e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>IF Grade *</Label>
                  <select className="w-full p-2 rounded-md border bg-background" value={formData.ifGrade} onChange={e => updateField("ifGrade", e.target.value)}>
                    <option>Grade 2</option><option>Grade 3</option><option>Grade 4</option><option>Grade 5</option>
                  </select>
                </div>
                {/* ... other selects follow same pattern ... */}
                <div className="space-y-2">
                  <Label>IFC Username *</Label>
                  <Input placeholder="username" value={formData.ifcProfileUrl} onChange={e => updateField("ifcProfileUrl", e.target.value)} required />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Why join us? *</Label>
                  <Input value={formData.whyJoinLatour} onChange={e => updateField("whyJoinLatour", e.target.value)} required />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <Loader2 className="animate-spin" /> : "Submit Application"}
              </Button>

              {!user && (
                <Button type="button" variant="outline" className="w-full" onClick={handleDiscordRegister} disabled={isLoading}>
                  <DiscordIcon className="mr-2 h-4 w-4" /> Register with Discord
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
      <PolarisFooter />
    </div>
  );
}
