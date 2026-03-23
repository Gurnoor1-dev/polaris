import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Radio, ShieldCheck, Zap, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const calculateDuration = (open: string, close: string) => {
  if (!open || !close) return 0;
  try {
    const [startH, startM] = open.split(':').map(Number);
    const [endH, endM] = close.split(':').map(Number);
    let startTotal = startH * 60 + startM;
    let endTotal = endH * 60 + endM;
    if (endTotal < startTotal) endTotal += 24 * 60;
    return (endTotal - startTotal) / 60;
  } catch (e) { return 0; }
};

export default function AdminAtcPireps() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["atc_pireps_with_pilots"],
    queryFn: async () => {
      // 1. Fetch PIREPs
      const { data: pireps, error: pError } = await supabase
        .from("atc_pireps")
        .select("*")
        .order("created_at", { ascending: false });

      if (pError) throw pError;

      // 2. Manual Join: Fetch all pilots related to these PIREPs
      const userIds = [...new Set(pireps.map(p => p.user_id))];
      const { data: pilots, error: plError } = await supabase
        .from("pilots")
        .select("user_id, full_name, pid")
        .in("user_id", userIds);

      if (plError) throw plError;

      // 3. Map them together manually
      return pireps.map(pirep => ({
        ...pirep,
        pilotData: pilots?.find(pl => pl.user_id === pirep.user_id)
      }));
    }
  });

  const updateStatus = useMutation({
    mutationFn: async ({ pirep, newStatus }: { pirep: any, newStatus: string }) => {
      const oldStatus = pirep.status;
      const sessionHours = calculateDuration(pirep.freq_open_time, pirep.freq_close_time) * (Number(pirep.multiplier) || 1);
      
      await supabase.from("atc_pireps").update({ status: newStatus }).eq("id", pirep.id);

      const { data: pilot } = await supabase.from("pilots").select("total_hours, total_pireps").eq("user_id", pirep.user_id).single();
      if (pilot) {
        let finalHours = Number(pilot.total_hours) || 0;
        let finalPireps = Number(pilot.total_pireps) || 0;
        if (newStatus === "approved" && oldStatus !== "approved") { finalHours += sessionHours; finalPireps += 1; }
        else if (oldStatus === "approved" && newStatus !== "approved") { finalHours = Math.max(0, finalHours - sessionHours); finalPireps = Math.max(0, finalPireps - 1); }
        await supabase.from("pilots").update({ total_hours: parseFloat(finalHours.toFixed(2)), total_pireps: finalPireps }).eq("user_id", pirep.user_id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["atc_pireps_with_pilots"] });
      toast.success("Database Updated");
    }
  });

  if (isLoading) return <div className="p-6 space-y-6"><Skeleton className="h-64 w-full rounded-3xl" /></div>;

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto animate-in fade-in">
      <div className="flex items-center justify-between border-b pb-6 border-border/50">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
            <Radio size={24} className="animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter uppercase italic leading-none">ATC DISPATCH</h1>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Validation Portal</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        {data?.map((pirep: any) => {
          const rawDuration = calculateDuration(pirep.freq_open_time, pirep.freq_close_time);
          const finalHours = rawDuration * (pirep.multiplier || 1);
          const pilot = pirep.pilotData; // Using our manually mapped data
          
          return (
            <Card key={pirep.id} className="overflow-hidden border-border bg-card/40 backdrop-blur-md shadow-2xl transition-all hover:border-primary/40">
              <CardContent className="p-0">
                <div className="flex flex-col lg:flex-row">
                  
                  {/* LEFT CONTENT */}
                  <div className="p-6 flex-1 space-y-6">
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-3">
                          <span className="text-5xl font-black font-mono tracking-tighter text-foreground leading-none">
                            {pirep.airport_icao}
                          </span>
                          {pirep.is_supervisor_override && (
                            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] font-black uppercase">
                              <ShieldCheck size={12} className="mr-1" /> SUP
                            </Badge>
                          )}
                        </div>
                        
                        {/* PILOT NAME & PID - DIRECTLY UNDER ICAO */}
                        <div className="mt-3 pl-1 border-l-2 border-primary/30">
                          <p className="text-sm font-black text-primary uppercase tracking-tight leading-none">
                            {pilot?.full_name || "PILOT NOT FOUND"}
                          </p>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mt-1">
                            PID: {pilot?.pid || "---"}
                          </p>
                        </div>
                      </div>
                      
                      <Badge className={cn(
                        "font-black px-4 py-1 uppercase tracking-widest h-fit",
                        pirep.status === 'approved' ? "bg-success/20 text-success border-success/30" : 
                        pirep.status === 'rejected' ? "bg-destructive/20 text-destructive border-destructive/30" : "bg-muted text-muted-foreground"
                      )} variant="outline">
                        {pirep.status}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-sm">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Date</p>
                        <p className="font-bold">{pirep.date}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Shift</p>
                        <p className="font-bold">{pirep.freq_open_time} - {pirep.freq_close_time} Z</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Stations</p>
                        <div className="flex flex-wrap gap-1">
                          {pirep.selected_frequencies?.map((f: string) => (
                            <Badge key={f} variant="secondary" className="text-[9px] font-bold bg-muted/50">{f}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT PAYOUT PANEL */}
                  <div className="bg-muted/30 lg:w-72 p-6 border-t lg:border-t-0 lg:border-l border-border flex flex-col justify-between">
                    <div className="text-center lg:text-right space-y-1">
                      <p className="text-[10px] font-black text-primary uppercase">Total Payout</p>
                      <div className="flex items-baseline justify-center lg:justify-end gap-1">
                        <span className="text-4xl font-black">{finalHours.toFixed(2)}</span>
                        <span className="text-xs font-bold opacity-50 uppercase">HRS</span>
                      </div>
                      <p className="text-[10px] font-bold text-success flex items-center justify-center lg:justify-end gap-1 uppercase">
                        <Zap size={10} /> {pirep.multiplier}x Multiplier
                      </p>
                    </div>

                    <div className="space-y-2 mt-6">
                      <Button 
                        className="w-full bg-success hover:bg-success/90 text-white font-black uppercase h-12 shadow-lg shadow-success/10"
                        disabled={updateStatus.isPending}
                        onClick={() => updateStatus.mutate({ pirep, newStatus: "approved" })}
                      >
                        {updateStatus.isPending ? <Loader2 className="animate-spin" /> : "Approve"}
                      </Button>
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" className="text-destructive font-bold uppercase text-[10px]" onClick={() => updateStatus.mutate({ pirep, newStatus: "rejected" })}>Reject</Button>
                        <Button variant="ghost" className="text-muted-foreground font-bold uppercase text-[10px]" onClick={() => updateStatus.mutate({ pirep, newStatus: "pending" })}>Reset</Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
