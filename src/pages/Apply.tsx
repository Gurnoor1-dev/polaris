import { useState, useEffect } from "react";
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
import kevaLogo from "@/assets/aeroflot-logo.png";
import { PolarisFooter } from "@/components/PolarisFooter";
import { getDiscordProfile, normalizeDiscordUsername } from "@/lib/discordIdentity";

const applicationSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  discordUsername: z.string().min(2, "Discord username is required"),
  ifGrade: z.enum(["Grade 2", "Grade 3", "Grade 4", "Grade 5"]),
  isIfatc: z.enum(["Yes", "No"]),
  ifcTrustLevel: z.enum(["Basic User (TL1)", "Member (TL2)", "Regular (TL3)", "Leader (TL4)", "I don't know"]),
  ageRange: z.enum(["13-16", "17-21", "22-27", "28-34", "35-41", "42-50", "51-60", "Above"]),
  ifcProfileUrl: z.string().min(2, "IFC username is required"),
  otherVaMembership: z.string().min(2, "Please answer if you are a member of another VA or VO"),
  whyJoinKeva: z.string().min(10, "Please share why you want to join KEVA"),
  hearAboutKeva: z.string().min(2, "Please share where you heard about KEVA"),
});

type ApplicationStatus = "idle" | "pending" | "approved" | "rejected";

export default function ApplyPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [discordUsername, setDiscordUsername] = useState("");
  const [ifGrade, setIfGrade] = useState("Grade 2");
  const [isIfatc, setIsIfatc] = useState("No");
  const [ifcTrustLevel, setIfcTrustLevel] = useState("I don't know");
  const [ageRange, setAgeRange] = useState("13-16");
  const [ifcProfileUrl, setIfcProfileUrl] = useState("");
  const [otherVaMembership, setOtherVaMembership] = useState("");
  const [whyJoinKeva, setWhyJoinKeva] = useState("");
  const [hearAboutKeva, setHearAboutKeva] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [applicationStatus, setApplicationStatus] = useState<ApplicationStatus>("idle");
  const { user, signUp, signInWithDiscord, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isDiscordRegisterFlow = searchParams.get("oauth") === "register";

  useEffect(() => {
    if (!user) return;
    if (isDiscordRegisterFlow) return;
    signOut();
  }, [user, isDiscordRegisterFlow]);

  useEffect(() => {
    let isMounted = true;
    const checkExistingApplication = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("pilot_applications")
        .select("status, discord_username, if_grade, is_ifatc, ifc_trust_level, age_range, other_va_membership, hear_about_aflv")
        .eq("user_id", user.id)
        .single();

      if (!isMounted) return;
      if (data) {
        const hasExtendedDetails = Boolean(data.discord_username && data.if_grade);
        if (data.status === "approved" || data.status === "rejected" || hasExtendedDetails) {
          setApplicationStatus(data.status as ApplicationStatus);
        }
      }
    };
    checkExistingApplication();
    return () => { isMounted = false; };
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isExistingDiscordUser = !!user && isDiscordRegisterFlow;

    const validation = applicationSchema.safeParse({
      fullName,
      email,
      password: isExistingDiscordUser ? undefined : password,
      discordUsername,
      ifGrade,
      isIfatc,
      ifcTrustLevel,
      ageRange,
      ifcProfileUrl,
      otherVaMembership,
      whyJoinKeva,
      hearAboutKeva,
    });

    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }

    setIsLoading(true);

    try {
      let applicantUserId = user?.id;
      let applicantEmail = email;
      const { discordUsername: oauthDiscordUsername, discordUserId } = getDiscordProfile(user);
      const normalizedDiscordUsername = normalizeDiscordUsername(discordUsername || oauthDiscordUsername || "");

      if (!isExistingDiscordUser) {
        console.log("Creating new user with email/password...");
        const { error: signUpError, userId: signedUpUserId } = await signUp(email, password);
        if (signUpError) {
          console.error("Sign-up error:", signUpError);
          toast.error(signUpError.message);
          setIsLoading(false);
          return;
        }
        if (!signedUpUserId) {
          console.error("No userId returned from signUp");
          toast.error("Sign-up failed: No user ID returned");
          setIsLoading(false);
          return;
        }
        applicantUserId = signedUpUserId;
        console.log("User created with ID:", applicantUserId);
      } else {
        const metadataEmail = typeof user?.user_metadata?.email === "string" ? user.user_metadata.email : null;
        applicantEmail = user?.email || metadataEmail || `discord-${user?.id}@users.noreply.local`;
        console.log("Using existing Discord user:", applicantUserId);
      }

      console.log("Creating application for user:", applicantUserId);

      // SUBMISSION: Mapping "KEVA" frontend state to database columns
      // Frontend Variable → Database Column mapping verified
      const applicationData = {
        // User / Auth
        user_id: applicantUserId,
        email: applicantEmail,
        
        // Personal Info
        full_name: fullName,
        
        // Discord
        discord_username: normalizedDiscordUsername,
        discord_user_id: discordUserId,
        
        // Experience & Qualifications
        if_grade: ifGrade,                        // Grade 2, 3, 4, 5
        is_ifatc: isIfatc,                        // Yes/No
        ifc_trust_level: ifcTrustLevel,          // TL1, TL2, TL3, TL4
        age_range: ageRange,                      // 13-16, 17-21, etc
        
        // IFC Profile
        ifc_profile_url: ifcProfileUrl.trim().replace(/^@+/, "") || null,
        
        // VA/VO Membership
        other_va_membership: otherVaMembership,
        
        // Application Essays / Motivation
        reason_for_joining: whyJoinKeva,         // Why join KEVA?
        hear_about_aflv: hearAboutKeva,          // ✓ MAPPED: Where heard about KEVA
        
        // Legacy compatibility (duplicates above for backward compatibility)
        experience_level: ifGrade,
        preferred_simulator: isIfatc,
        
        // Status
        status: "pending",
      };

      console.log("Application data:", applicationData);

      const { error: appError, data: appData } = await supabase
        .from("pilot_applications")
        .insert([applicationData])
        .select();

      if (appError) {
        console.error("Application insert error:", appError);
        throw appError;
      }

      console.log("Application created successfully:", appData);
      toast.success("Application submitted successfully!");
      navigate("/auth", { replace: true });
    } catch (err) {
      console.error("Submit error:", err);
      toast.error("Failed to submit application. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDiscordRegister = async () => {
    setIsLoading(true);
    try {
      const { error } = await signInWithDiscord("/apply", "register");
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || "Could not start Discord registration");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex justify-between items-center p-4">
        <Link to="/auth" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to login
        </Link>
        <ThemeToggle />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4">
              <img src={kevaLogo} alt="Korean Air Virtual" className="h-12 w-auto object-contain" />
            </div>
            <CardTitle className="text-2xl">Join Korean Air Virtual</CardTitle>
            <CardDescription>
              Apply for a pilot position with our virtual airline on Infinite Flight
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">Personal Information</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name *</Label>
                    <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={isLoading} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} readOnly={isDiscordRegisterFlow && !!user} required />
                  </div>
                </div>
                {!isDiscordRegisterFlow && (
                  <div className="space-y-2">
                    <Label htmlFor="password">Password *</Label>
                    <Input id="password" type="password" placeholder="Min 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} required />
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">Application Details</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="discordUsername">Discord Username *</Label>
                    <Input id="discordUsername" value={discordUsername} onChange={(e) => setDiscordUsername(e.target.value)} disabled={isLoading} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ifGrade">IF Grade (Minimum Grade 2) *</Label>
                    <select id="ifGrade" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={ifGrade} onChange={(e) => setIfGrade(e.target.value)} disabled={isLoading} required>
                      <option>Grade 2</option><option>Grade 3</option><option>Grade 4</option><option>Grade 5</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="isIfatc">Are you IFATC? *</Label>
                    <select id="isIfatc" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={isIfatc} onChange={(e) => setIsIfatc(e.target.value)} disabled={isLoading} required>
                      <option>Yes</option><option>No</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ifcTrustLevel">IFC Trust Level *</Label>
                    <select id="ifcTrustLevel" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={ifcTrustLevel} onChange={(e) => setIfcTrustLevel(e.target.value)} disabled={isLoading} required>
                      <option>Basic User (TL1)</option><option>Member (TL2)</option><option>Regular (TL3)</option><option>Leader (TL4)</option><option>I don't know</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ageRange">Age (Min 13) *</Label>
                    <select id="ageRange" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={ageRange} onChange={(e) => setAgeRange(e.target.value)} disabled={isLoading} required>
                      <option>13-16</option><option>17-21</option><option>22-27</option><option>28-34</option><option>35-41</option><option>42-50</option><option>51-60</option><option>Above</option>
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="ifcProfileUrl">IFC Username (without @) *</Label>
                    <Input id="ifcProfileUrl" value={ifcProfileUrl} onChange={(e) => setIfcProfileUrl(e.target.value)} disabled={isLoading} required />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="otherVaMembership">Other VA/VO Memberships? *</Label>
                    <Input id="otherVaMembership" value={otherVaMembership} onChange={(e) => setOtherVaMembership(e.target.value)} disabled={isLoading} required />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="whyJoinKeva">Why do you want to join KEVA? *</Label>
                    <Input id="whyJoinKeva" value={whyJoinKeva} onChange={(e) => setWhyJoinKeva(e.target.value)} disabled={isLoading} required />
                    <Label htmlFor="hearAboutKeva">Where did you hear about KEVA? *</Label>
                    <Input id="hearAboutKeva" value={hearAboutKeva} onChange={(e) => setHearAboutKeva(e.target.value)} disabled={isLoading} required />
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Application
              </Button>

              <div className="space-y-3">
                <div className="relative">
               </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
      <PolarisFooter />
    </div>
  );
}
