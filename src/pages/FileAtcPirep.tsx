import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, Pause, Clock, Radio, ShieldCheck, Zap, Loader2 } from "lucide-react";
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
    queryKey: ["atc_pireps"],
    queryFn: async () => {
      // Fetching PIREPs + Joining the Pilots table via user_id
      const { data, error } = await supabase
        .from("atc_pireps")
        .select(`
          *,
          pilots (
            full_name,
            pid
          )
        `)
        .order("created_at", { ascending: false });
      
      if (error) {
        console.error("Supabase Error:", error);
        throw error;
      }
      return data;
    }
  });

  const updateStatus = useMutation({
    mutationFn: async ({ pirep, newStatus }: { pirep: any, newStatus: string }) => {
      const oldStatus = pirep.status;
      if (oldStatus === newStatus) return;

      const sessionHours = calculateDuration(pirep.freq_open_time, pirep.freq_close_time) * (Number(pirep.multiplier) || 1);

      const { error: pirepError } = await supabase
        .from("atc_pireps")
        .update({ status: newStatus })
        .eq("id", pirep.id);

      if (pirepError) throw pirepError;

      const { data: pilot } = await supabase
        .from("pilots")
        .select("total_hours, total_pireps")
        .eq("user_id", pirep.user_id)
        .single();

      if (pilot) {
        let finalHours = Number(pilot.total_hours) || 0;
        let finalPireps = Number(pilot.total_pireps) || 0;

        if (newStatus === "approved" && oldStatus !== "approved") {
          finalHours += sessionHours;
          finalPireps += 1;
        } else if (oldStatus === "approved" && newStatus !== "approved") {
          finalHours = Math.max(0, finalHours - sessionHours);
          finalPireps = Math.max(0, finalPireps - 1);
        }

        const { error: pilotError } = await supabase
          .from("pilots")
          .update({ 
            total_hours: parseFloat(finalHours.toFixed(2)), 
            total_pireps: finalPireps 
          })
          .eq("user_id", pirep.user_id);

        if (pilotError) throw pilotError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["atc_pireps"] });
      toast.success("Database synchronized successfully");
    }
  });

  if (isLoading) return <div className="p-6 space-y-6"><Skeleton className="h-12 w-48" /><Skeleton className="h-64 w-full rounded-3xl" /></div>;

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto animate-in fade-in duration-500">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6 border-border/50">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
            <Radio size={28} className="animate-pulse" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tighter uppercase italic">ATC DISPATCH</h1>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] opacity-60">Validation & Hours Crediting</p>
          </div>
        </div>
        <Badge variant="outline" className="h-fit py-1 px-4 font-black border-primary/20 bg-primary/5 text-primary">
          {data?.filter(p => p.status === 'pending').length} PENDING
        </Badge>
      </div>

      <div className="grid gap-6">
        {data?.map((pirep: any) => {
          const rawDuration = calculateDuration(pirep.freq_open_time, pirep.freq_close_time);
          const finalHours = rawDuration * (pirep.multiplier || 1);
          
          // Debugging: If this says 'undefined', the join failed. 
          // Note: If your FK is named differently, you might need pilots:user_id(...)
          const pilotInfo = Array.isArray(pirep.pilots) ? pirep.pilots[0] : pirep.pilots;
          
          return (
            <Card key={pirep.id} className="overflow-hidden border-border bg-card/40 backdrop-blur-md shadow-xl transition-all hover:border-primary/30">
              <CardContent className="p-0">
                <div className="flex flex-col lg:flex-row">
                  
                  {/* LEFT INFO PANEL */}
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
                        
                        {/* PILOT INFO SUBHEADER - Forced below ICAO */}
                        <p className="text-[12px] font-black text-primary/80 uppercase tracking-widest mt-2 pl-1">
                          {pilotInfo?.full_name || "MISSING NAME"} 
                          <span className="text-muted-foreground ml-2">({pilotInfo?.pid || "N/A"})</span>
                        </p>
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
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Shift Time</p>
                        <p className="font-bold">{pirep.freq_open_time} - {pirep.freq_close_time} Z</p>
                      </div>
                      <div className="col-span-2 md:col-span-1 space-y-2">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Frequencies</p>
                        <div className="flex flex-wrap gap-1">
                          {pirep.selected_frequencies?.map((f: string) => (
                            <Badge key={f} variant="secondary" className="text-[9px] font-bold bg-muted/50">{f}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    {pirep.remarks && (
                      <div className="p-3 bg-muted/20 rounded-xl border border-dashed text-xs italic text-muted-foreground">
                        "{pirep.remarks}"
                      </div>
                    )}
                  </div>

                  {/* RIGHT ACTION PANEL */}
                  <div className="bg-muted/30 lg:w-80 p-6 border-t lg:border-t-0 lg:border-l border-border flex flex-col justify-between gap-6">
                    <div className="space-y-1 text-center lg:text-right">
                      <p className="text-[10px] font-black text-primary uppercase tracking-widest">Total Payout</p>
                      <div className="flex items-baseline justify-center lg:justify-end gap-2">
                        <span className="text-4xl font-black">{finalHours.toFixed(2)}</span>
                        <span className="text-xs font-bold opacity-50 uppercase">HRS</span>
                      </div>
                      <p className="text-[10px] font-bold text-success flex items-center justify-center lg:justify-end gap-1 uppercase">
                        <Zap size={10} /> {pirep.multiplier}x Multiplier applied
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Button 
                        className="w-full bg-success hover:bg-success/90 text-white font-black uppercase tracking-widest h-12 shadow-lg shadow-success/10"
                        disabled={pirep.status === 'approved' || updateStatus.isPending}
                        onClick={() => updateStatus.mutate({ pirep, newStatus: "approved" })}
                      >
                        {updateStatus.isPending ? <Loader2 className="animate-spin" /> : <Check size={18} className="mr-2" />} Approve
                      </Button>
                      <div className="grid grid-cols-2 gap-2">
                        <Button 
                          variant="outline" className="border-destructive/20 text-destructive hover:bg-destructive/10 font-bold uppercase text-[10px]"
                          disabled={pirep.status === 'rejected' || updateStatus.isPending}
                          onClick={() => updateStatus.mutate({ pirep, newStatus: "rejected" })}
                        >
                          <X size={14} className="mr-1" /> Reject
                        </Button>
                        <Button 
                          variant="ghost" className="text-muted-foreground font-bold uppercase text-[10px]"
                          onClick={() => updateStatus.mutate({ pirep, newStatus: "pending" })}
                        >
                          <Pause size={14} className="mr-1" /> Reset
                        </Button>
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
