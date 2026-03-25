import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Radio, ShieldCheck, Send, Zap, Clock, MapPin } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const FREQUENCIES = ["Delivery", "Ground", "Tower", "Approach", "Departure", "Center", "ATIS"];

export default function PublicAtcPirep() {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [icao, setIcao] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [openTime, setOpenTime] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [selectedFreqs, setSelectedFreqs] = useState<string[]>([]);
  const [remarks, setRemarks] = useState("");
  const [isSup, setIsSup] = useState(false);

  const toggleFreq = (freq: string) => {
    setSelectedFreqs(prev => 
      prev.includes(freq) ? prev.filter(f => f !== freq) : [...prev, freq]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please log in first");

      const { error } = await supabase.from("atc_pireps").insert({
        user_id: user.id,
        airport_icao: icao.toUpperCase(),
        date,
        freq_open_time: openTime,
        freq_close_time: closeTime,
        selected_frequencies: selectedFreqs,
        remarks,
        is_supervisor_override: isSup,
        status: "pending",
        multiplier: isSup ? 1.5 : 1.0 // Example logic
      });

      if (error) throw error;

      toast.success("ATC PIREP Submitted for review!");
      // Reset form
      setIcao("");
      setOpenTime("");
      setCloseTime("");
      setSelectedFreqs([]);
      setRemarks("");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto py-10 animate-in fade-in duration-700">
      
      {/* HEADER SECTION */}
      <div className="flex items-center gap-4 mb-8">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
          <Radio size={24} className="animate-pulse" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tighter uppercase italic leading-none">File ATC PIREP</h1>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Log your controller hours</p>
        </div>
      </div>

      <Card className="border-border bg-card/40 backdrop-blur-md shadow-2xl overflow-hidden">
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* ICAO & DATE */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest opacity-70">Airport ICAO</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 text-muted-foreground" size={16} />
                  <Input 
                    placeholder="E.G. KIAD" 
                    className="pl-10 font-bold uppercase" 
                    value={icao} 
                    onChange={(e) => setIcao(e.target.value)}
                    required 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest opacity-70">Date of Session</Label>
                <Input 
                  type="date" 
                  className="font-bold" 
                  value={date} 
                  onChange={(e) => setDate(e.target.value)}
                  required 
                />
              </div>
            </div>

            {/* TIME SLOTS */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest opacity-70">Time Open (Z)</Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-3 text-muted-foreground" size={16} />
                  <Input 
                    type="time" 
                    className="pl-10 font-bold" 
                    value={openTime} 
                    onChange={(e) => setOpenTime(e.target.value)}
                    required 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest opacity-70">Time Closed (Z)</Label>
                <Input 
                  type="time" 
                  className="font-bold pl-10" 
                  value={closeTime} 
                  onChange={(e) => setCloseTime(e.target.value)}
                  required 
                />
              </div>
            </div>

            {/* FREQUENCY SELECTION */}
            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-widest opacity-70">Stations Controlled</Label>
              <div className="flex flex-wrap gap-2">
                {FREQUENCIES.map(freq => (
                  <Badge
                    key={freq}
                    variant={selectedFreqs.includes(freq) ? "default" : "outline"}
                    className={cn(
                      "cursor-pointer py-1.5 px-3 font-bold uppercase text-[10px] transition-all",
                      selectedFreqs.includes(freq) ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "hover:bg-primary/10"
                    )}
                    onClick={() => toggleFreq(freq)}
                  >
                    {freq}
                  </Badge>
                ))}
              </div>
            </div>

            {/* SUPERVISOR TOGGLE */}
            <div className="p-4 rounded-2xl bg-muted/30 border border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn("transition-transform duration-500", isSup && "animate-bounce")}>
                  <ShieldCheck className={cn("w-6 h-6", isSup ? "text-amber-500" : "text-muted-foreground")} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-tight leading-none">Supervisor Override</p>
                  <p className="text-[9px] font-bold text-muted-foreground mt-1">Apply 1.5x multiplier for training/sup duty</p>
                </div>
              </div>
              <Switch checked={isSup} onCheckedChange={setIsSup} />
            </div>

            {/* REMARKS */}
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest opacity-70">Additional Remarks</Label>
              <Textarea 
                placeholder="Staffing event, training session, etc..." 
                className="bg-background/50 border-white/10 italic text-sm"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>

            {/* SUBMIT */}
            <Button 
              type="submit" 
              className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest shadow-xl shadow-primary/20"
              disabled={loading}
            >
              {loading ? <Loader2 className="animate-spin" /> : <><Send size={18} className="mr-2" /> Submit PIREP</>}
            </Button>

          </form>
        </CardContent>
      </Card>

      <div className="mt-6 flex items-center justify-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em] opacity-50">
        <Zap size={12} /> System automatically calculates pay hours upon approval
      </div>
    </div>
  );
}
