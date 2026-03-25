import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Radio, ShieldCheck, Send, Clock, MapPin, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Mapping codes to labels
const FREQ_MAP = [
  { code: "G", label: "Ground" },
  { code: "T", label: "Tower" },
  { code: "S", label: "ATIS" },
  { code: "A", label: "Approach" },
  { code: "D", label: "Departure" },
  { code: "C", label: "Center" },
];

export default function PublicAtcPirep() {
  const [loading, setLoading] = useState(false);
  const [icao, setIcao] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [openTime, setOpenTime] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [remarks, setRemarks] = useState("");
  const [isSup, setIsSup] = useState(false);

  const toggleFreq = (code: string) => {
    // If Supervisor is ON, ignore all restrictions
    if (isSup) {
      setSelectedCodes(prev => 
        prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
      );
      return;
    }

    // Logic: Group 1 (G, T, S) vs Group 2 (A, D, C)
    const isGTS = ["G", "T", "S"].includes(code);
    const isADC = ["A", "D", "C"].includes(code);

    setSelectedCodes(prev => {
      const isSelecting = !prev.includes(code);
      if (!isSelecting) return prev.filter(c => c !== code);

      // Check if trying to mix groups
      const hasGTS = prev.some(c => ["G", "T", "S"].includes(c));
      const hasADC = prev.some(c => ["A", "D", "C"].includes(c));

      if (isGTS && hasADC) {
        toast.error("Cannot select GTS while ADC is active (unless Supervisor)");
        return prev;
      }
      if (isADC && hasGTS) {
        toast.error("Cannot select ADC while GTS is active (unless Supervisor)");
        return prev;
      }

      return [...prev, code];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCodes.length === 0) return toast.error("Select at least one station");
    
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
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
        multiplier: isSup ? 1.5 : 1.0
      });

      if (error) throw error;
      toast.success("PIREP Submitted Successfully");
      setIcao(""); setOpenTime(""); setCloseTime(""); setSelectedCodes([]); setRemarks("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto py-10">
      
      <div className="flex items-center gap-4 mb-8">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
          <Radio size={24} className="animate-pulse" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tighter uppercase italic leading-none">ATC Dispatch</h1>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Flight Data Entry</p>
        </div>
      </div>

      <Card className="border-border bg-card/40 backdrop-blur-md shadow-2xl">
        <CardContent className="p-6 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase opacity-60">Airport</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 text-muted-foreground" size={16} />
                  <Input placeholder="ICAO" className="pl-10 font-bold uppercase" value={icao} onChange={e => setIcao(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase opacity-60">Date</Label>
                <Input type="date" className="font-bold" value={date} onChange={e => setDate(e.target.value)} required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase opacity-60">Open (Z)</Label>
                <Input type="time" className="font-bold" value={openTime} onChange={e => setOpenTime(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase opacity-60">Close (Z)</Label>
                <Input type="time" className="font-bold" value={closeTime} onChange={e => setCloseTime(e.target.value)} required />
              </div>
            </div>

            {/* FREQUENCY SELECTION GRID */}
            <div className="space-y-4">
              <Label className="text-[10px] font-black uppercase opacity-60">Consolidated Stations</Label>
              <div className="grid grid-cols-3 gap-2">
                {FREQ_MAP.map(f => (
                  <Button
                    key={f.code}
                    type="button"
                    variant={selectedCodes.includes(f.code) ? "default" : "outline"}
                    className={cn(
                      "h-14 flex flex-col items-center justify-center gap-0.5 border-white/10 transition-all",
                      selectedCodes.includes(f.code) ? "bg-primary shadow-lg shadow-primary/20 scale-95" : "hover:bg-primary/5"
                    )}
                    onClick={() => toggleFreq(f.code)}
                  >
                    <span className="text-lg font-black">{f.code}</span>
                    <span className="text-[8px] uppercase opacity-60 font-bold">{f.label}</span>
                  </Button>
                ))}
              </div>
            </div>

            {/* SUP OVERRIDE */}
            <div className={cn(
              "p-4 rounded-2xl border transition-all flex items-center justify-between",
              isSup ? "bg-amber-500/10 border-amber-500/30" : "bg-muted/30 border-white/5"
            )}>
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg bg-background/50", isSup && "animate-bounce")}>
                  <ShieldCheck className={isSup ? "text-amber-500" : "text-muted-foreground"} size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase">Supervisor Override</p>
                  <p className="text-[9px] font-bold text-muted-foreground">Unlock all station combinations</p>
                </div>
              </div>
              <Switch checked={isSup} onCheckedChange={(val) => {
                setIsSup(val);
                if (!val) setSelectedCodes([]); // Clear on toggle off to prevent illegal states
              }} />
            </div>

            <Button disabled={loading} className="w-full h-14 bg-primary text-white font-black uppercase tracking-widest shadow-xl">
              {loading ? <Loader2 className="animate-spin" /> : <><Send className="mr-2" size={18} /> File PIREP</>}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
