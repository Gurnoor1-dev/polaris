import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Radio, ShieldCheck, Send, MapPin, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const FREQ_MAP = [
  { code: "G", label: "Ground" },
  { code: "T", label: "Tower" },
  { code: "S", label: "ATIS" },
  { code: "A", label: "Approach" },
  { code: "D", label: "Departure" },
  { code: "C", label: "Center" },
];

export default function PublicAtcPirep() {
  const { isReady } = useAuth();
  const [loading, setLoading] = useState(false);
  const [icao, setIcao] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [openTime, setOpenTime] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [remarks, setRemarks] = useState("");
  const [isSup, setIsSup] = useState(false);
  const [selectedMultiplier, setSelectedMultiplier] = useState<string>("1");

  // ✅ Only fetch once auth is fully ready — prevents unauthenticated RLS rejections
  const { data: atcMultipliers } = useQuery({
    queryKey: ["atc-multiplier-configs-public"],
    enabled: isReady,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atc_multiplier_configs")
        .select("id, name, value")
        .eq("is_active", true)
        .order("value");
      if (error) throw error;
      return data || [];
    },
  });

  const toggleFreq = (code: string) => {
    if (isSup) {
      setSelectedCodes((prev) =>
        prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
      );
      return;
    }

    setSelectedCodes((prev) => {
      const isSelecting = !prev.includes(code);
      if (!isSelecting) return prev.filter((c) => c !== code);

      const hasGorT = prev.some((c) => ["G", "T"].includes(c));
      const hasAorD = prev.some((c) => ["A", "D"].includes(c));
      const hasC = prev.includes("C");

      if (code === "C" && (hasGorT || hasAorD)) {
        toast.error("Center cannot be combined with G, T, A, or D");
        return prev;
      }
      if (hasC && ["G", "T", "A", "D"].includes(code)) {
        toast.error("Cannot add stations to a Center session");
        return prev;
      }
      if (["A", "D"].includes(code) && (hasGorT || hasC)) {
        toast.error("Approach/Departure cannot be combined with G, T, or C");
        return prev;
      }
      if (hasAorD && ["G", "T"].includes(code)) {
        toast.error("Cannot combine G/T with an Approach/Departure session");
        return prev;
      }
      if (["G", "T"].includes(code) && (hasAorD || hasC)) {
        toast.error("Ground/Tower cannot be combined with A, D, or C");
        return prev;
      }

      return [...prev, code];
    });
  };

  const calcDuration = () => {
    if (!openTime || !closeTime) return null;
    try {
      const [sh, sm] = openTime.split(":").map(Number);
      const [eh, em] = closeTime.split(":").map(Number);
      let start = sh * 60 + sm;
      let end = eh * 60 + em;
      if (end < start) end += 24 * 60;
      return (end - start) / 60;
    } catch {
      return null;
    }
  };

  const rawHours = calcDuration();
  const multiplierValue = parseFloat(selectedMultiplier) || 1;
  const totalHours = rawHours !== null ? rawHours * multiplierValue : null;

  const formatHours = (h: number) => {
    const hrs = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCodes.length === 0) return toast.error("Select at least one station");
    if (!openTime || !closeTime) return toast.error("Enter open and close times");

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Authentication required");

      const { error } = await supabase.from("atc_pireps").insert({
        user_id: user.id,
        airport_icao: icao.toUpperCase(),
        date,
        freq_open_time: openTime,
        freq_close_time: closeTime,
        selected_frequencies: selectedCodes,
        remarks,
        is_supervisor_override: isSup,
        status: "pending",
        multiplier: multiplierValue,
      });

      if (error) throw error;

      toast.success("ATC PIREP submitted successfully!");
      setIcao("");
      setOpenTime("");
      setCloseTime("");
      setSelectedCodes([]);
      setRemarks("");
      setSelectedMultiplier("1");
      setIsSup(false);
    } catch (err: any) {
      toast.error(err.message || "Submission failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto py-10 animate-in fade-in duration-500">
      <div className="flex items-center gap-4 mb-8">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
          <Radio size={24} className="animate-pulse" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tighter uppercase italic leading-none">
            ATC Dispatch
          </h1>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
            Session Data Entry
          </p>
        </div>
      </div>

      <Card className="border-border bg-card/40 backdrop-blur-md shadow-2xl">
        <CardContent className="p-6 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Airport + Date */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase opacity-60">Airport</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 text-muted-foreground" size={16} />
                  <Input
                    placeholder="ICAO"
                    className="pl-10 font-bold uppercase"
                    value={icao}
                    onChange={(e) => setIcao(e.target.value)}
                    maxLength={4}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase opacity-60">Date</Label>
                <Input
                  type="date"
                  className="font-bold"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Open / Close times */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase opacity-60">Open (Z)</Label>
                <Input
                  type="time"
                  className="font-bold"
                  value={openTime}
                  onChange={(e) => setOpenTime(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase opacity-60">Close (Z)</Label>
                <Input
                  type="time"
                  className="font-bold"
                  value={closeTime}
                  onChange={(e) => setCloseTime(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Multiplier + live hours preview */}
            <div className="grid grid-cols-2 gap-4 items-end">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase opacity-60 flex items-center gap-1">
                  <Zap size={10} /> Hours Multiplier
                </Label>
                <Select value={selectedMultiplier} onValueChange={setSelectedMultiplier}>
                  <SelectTrigger className="font-bold">
                    <SelectValue placeholder="Select multiplier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">General Controlling (1.0×)</SelectItem>
                    {atcMultipliers?.map((m) => (
                      <SelectItem key={m.id} value={String(m.value)}>
                        {m.name} ({Number(m.value).toFixed(1)}×)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {totalHours !== null && (
                <div className="rounded-xl border bg-primary/5 border-primary/20 px-4 py-3 flex flex-col items-center justify-center">
                  <p className="text-[9px] font-black uppercase opacity-60 tracking-widest mb-0.5">
                    Total Hours
                  </p>
                  <p className="text-2xl font-black font-mono text-primary leading-none">
                    {formatHours(totalHours)}
                  </p>
                  {multiplierValue !== 1 && rawHours !== null && (
                    <p className="text-[9px] text-muted-foreground mt-1">
                      {formatHours(rawHours)} × {multiplierValue}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Stations */}
            <div className="space-y-4">
              <Label className="text-[10px] font-black uppercase opacity-60">
                Stations Controlled
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {FREQ_MAP.map((f) => (
                  <Button
                    key={f.code}
                    type="button"
                    variant={selectedCodes.includes(f.code) ? "default" : "outline"}
                    className={cn(
                      "h-14 flex flex-col items-center justify-center gap-0.5 border-white/10 transition-all",
                      selectedCodes.includes(f.code)
                        ? "bg-primary shadow-lg shadow-primary/20 scale-95"
                        : "hover:bg-primary/5"
                    )}
                    onClick={() => toggleFreq(f.code)}
                  >
                    <span className="text-lg font-black">{f.code}</span>
                    <span className="text-[8px] uppercase opacity-60 font-bold">{f.label}</span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Supervisor override */}
            <div
              className={cn(
                "p-4 rounded-2xl border transition-all flex items-center justify-between",
                isSup
                  ? "bg-amber-500/10 border-amber-500/30"
                  : "bg-muted/30 border-white/5"
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "p-2 rounded-lg bg-background/50",
                    isSup && "animate-bounce"
                  )}
                >
                  <ShieldCheck
                    className={isSup ? "text-amber-500" : "text-muted-foreground"}
                    size={20}
                  />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase">Supervisor Override</p>
                  <p className="text-[9px] font-bold text-muted-foreground">
                    Unlock all station combinations
                  </p>
                </div>
              </div>
              <Switch
                checked={isSup}
                onCheckedChange={(val) => {
                  setIsSup(val);
                  if (!val) setSelectedCodes([]);
                }}
              />
            </div>

            {/* Remarks */}
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase opacity-60">Remarks</Label>
              <Textarea
                placeholder="Session details..."
                className="bg-background/50 border-white/10 italic text-sm"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>

            <Button
              disabled={loading}
              className="w-full h-14 bg-primary text-white font-black uppercase tracking-widest shadow-xl"
            >
              {loading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <>
                  <Send className="mr-2" size={18} /> File PIREP
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
