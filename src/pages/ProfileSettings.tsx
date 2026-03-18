import { useEffect, useMemo, useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { normalizeDiscordUsername } from "@/lib/discordIdentity";
import { UserCog, Camera, Loader2, User } from "lucide-react";

// --- HELPERS ---
const parseIfcUsernameFromProfileValue = (value: string | null | undefined) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!trimmed.includes("/")) return trimmed.replace(/^@+/, "");
  const directUsernameMatch = trimmed.match(/\/u\/([^/?#]+)/i);
  if (directUsernameMatch?.[1]) return directUsernameMatch[1].replace(/^@+/, "");
  return null;
};

const getRandomBrightColor = (name: string) => {
  const colors = ["bg-orange-500", "bg-pink-500", "bg-emerald-500", "bg-sky-500", "bg-violet-500", "bg-amber-500"];
  const index = name ? name.length % colors.length : 0;
  return colors[index];
};

export default function ProfileSettings() {
  const { user, pilot, refreshPilot } = useAuth();
  const [discordUsername, setDiscordUsername] = useState("");
  const [ifcUsername, setIfcUsername] = useState("");
  const [isSavingDiscord, setIsSavingDiscord] = useState(false);
  const [isSavingIfc, setIsSavingIfc] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- IMAGE UPLOAD LOGIC ---
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error("Please upload an image file.");
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}-${Math.random()}.${fileExt}`;

      // 1. Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // 3. Update Pilots Table
      const { error: updateError } = await supabase
        .from('pilots')
        .update({ avatar_url: publicUrl })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      await refreshPilot();
      toast.success("Profile picture updated!");
    } catch (error: any) {
      toast.error("Upload failed: " + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  // --- DATA LOADING ---
  const discordFromOAuth = useMemo(() => {
    const identity = user?.identities?.find((i) => i.provider === "discord");
    if (!identity) return "";
    const data = (identity.identity_data || {}) as Record<string, unknown>;
    const raw = (typeof data.username === "string" && data.username) || "";
    return normalizeDiscordUsername(raw);
  }, [user]);

  useEffect(() => {
    if (pilot?.discord_username) setDiscordUsername(pilot.discord_username);
    else if (discordFromOAuth) setDiscordUsername(discordFromOAuth);
  }, [pilot?.discord_username, discordFromOAuth]);

  useEffect(() => {
    if (pilot?.ifc_username) setIfcUsername(pilot.ifc_username);
  }, [pilot?.ifc_username]);

  // --- SAVE ACTIONS ---
  const saveDiscordUsername = async () => {
    if (!pilot?.id) return;
    setIsSavingDiscord(true);
    const { error } = await supabase.from("pilots").update({ discord_username: normalizeDiscordUsername(discordUsername) }).eq("id", pilot.id);
    setIsSavingDiscord(false);
    if (error) toast.error("Failed to save Discord username");
    else { await refreshPilot(); toast.success("Discord username saved"); }
  };

  const saveIfcUsername = async () => {
    if (!pilot?.id) return;
    setIsSavingIfc(true);
    const { error } = await supabase.from("pilots").update({ ifc_username: ifcUsername.trim().replace(/^@+/, "") || null }).eq("id", pilot.id);
    setIsSavingIfc(false);
    if (error) toast.error("Failed to save IFC username");
    else { await refreshPilot(); toast.success("IFC username saved"); }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      <div className="flex items-center gap-3 mb-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm">
          <UserCog className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tighter">Pilot Profile</h1>
          <p className="text-sm text-muted-foreground">Identity & Personalization</p>
        </div>
      </div>

      {/* --- AVATAR CARD --- */}
      <Card className="overflow-hidden border-none bg-gradient-to-br from-card to-muted/30 shadow-xl">
        <CardContent className="p-10 flex flex-col items-center justify-center relative">
          <div className="relative group">
            {/* The Main Circle */}
            <div className={`h-32 w-32 rounded-full border-4 border-background shadow-2xl flex items-center justify-center overflow-hidden transition-transform group-hover:scale-105 ${!pilot?.avatar_url ? getRandomBrightColor(pilot?.full_name || 'K') : 'bg-muted'}`}>
              {pilot?.avatar_url ? (
                <img src={pilot.avatar_url} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <span className="text-5xl font-black text-white uppercase italic">
                  {pilot?.full_name?.charAt(0) || <User size={48} />}
                </span>
              )}
              
              {/* Upload Loading Overlay */}
              {isUploading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <Loader2 className="animate-spin text-white" />
                </div>
              )}
            </div>

            {/* Little Clickable Circle (Top Right) */}
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="absolute -top-1 -right-1 h-10 w-10 bg-primary text-primary-foreground rounded-full border-4 border-background shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors z-10"
            >
              <Camera size={18} />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleAvatarUpload} 
              className="hidden" 
              accept="image/*" 
            />
          </div>

          <div className="mt-6 text-center">
            <h2 className="text-2xl font-black tracking-tight">{pilot?.full_name || "KEVA Pilot"}</h2>
            <p className="text-sm text-muted-foreground font-mono">{user?.email}</p>
          </div>
        </CardContent>
      </Card>

      {/* --- DISCORD MAPPING --- */}
      <Card className="border-border/50 shadow-md">
        <CardHeader>
          <CardTitle className="text-lg font-bold">Discord Mapping</CardTitle>
          <CardDescription>Links your Discord identity to site hours.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Discord Username</Label>
            <Input
              value={discordUsername}
              onChange={(e) => setDiscordUsername(e.target.value)}
              placeholder="username"
              className="bg-muted/30"
            />
          </div>
          <Button onClick={saveDiscordUsername} disabled={isSavingDiscord} className="w-full sm:w-auto font-bold">
            {isSavingDiscord ? <Loader2 className="animate-spin mr-2" size={16}/> : null}
            Save Discord Identity
          </Button>
        </CardContent>
      </Card>

      {/* --- IFC SETTINGS --- */}
      <Card className="border-border/50 shadow-md">
        <CardHeader>
          <CardTitle className="text-lg font-bold italic uppercase">Infinite Flight Community</CardTitle>
          <CardDescription>Username for validation and ranking.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>IFC Username</Label>
            <Input
              value={ifcUsername}
              onChange={(e) => setIfcUsername(e.target.value)}
              placeholder="e.g. CaptainKeva"
              className="bg-muted/30"
            />
          </div>
          <Button onClick={saveIfcUsername} disabled={isSavingIfc} variant="outline" className="w-full sm:w-auto font-bold border-primary/20 text-primary hover:bg-primary/5">
            {isSavingIfc ? <Loader2 className="animate-spin mr-2" size={16}/> : null}
            Update IFC Profile
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
