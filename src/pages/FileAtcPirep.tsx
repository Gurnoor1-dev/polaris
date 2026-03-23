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
      // Logic: Fetch PIREPs and attempt to join pilots
      const { data, error } = await supabase
        .from("atc_pireps")
        .select(`
          *,
          pilots!inner (
            full_name,
            pid
          )
        `)
        .order("created_at", { ascending: false });
      
      if (error) {
        console.error("Join failed, trying fallback fetch...");
        // Fallback: If join fails, just get PIREPs
        const { data: fallbackData } = await supabase
          .from("atc_pireps")
          .select("*")
          .order("created_at", { ascending: false });
        return fallbackData;
      }
      return data;
    }
  });

  const updateStatus = useMutation({
    mutationFn: async ({ pirep, newStatus }: { pirep: any, newStatus: string }) => {
      const oldStatus = pirep.status;
      if (oldStatus === newStatus) return;
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
      qc.invalidateQueries({ queryKey: ["atc_pireps"] });
      toast.success("Sync Complete");
    }
  });

  if (isLoading) return <div className="p-6 space-y-6"><Skeleton className="h-64 w-full rounded-3xl" /></div>;

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between border-b pb-6 border-border/50">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary"><Radio size={24} /></div>
          <h1 className="text-2xl font-black tracking-tighter uppercase italic">ATC DISPATCH</h1>
        </div>
      </div>

      <div className="grid gap-6">
        {data?.map((pirep: any) => {
          const rawDuration = calculateDuration(pirep.freq_open_time, pirep.freq_close_time);
          const finalHours = rawDuration * (pirep.multiplier || 1);
          const pilot = Array.isArray(pirep.pilots) ? pirep.pilots[0] : pirep.pilots;
          
          return (
            <Card key={pirep.id} className="overflow-hidden border-border bg-card/40 backdrop-blur-md">
              <CardContent className="p-0">
                <div className="flex flex-col lg:flex-row">
                  <div className="p-6 flex-1 space-y-6">
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col">
                        <span className="text-5xl font-black font-mono tracking-tighter leading-none">
                          {pirep.airport_icao}
                        </span>
                        
                        {/* PILOT SUBTITLE - Fixed Position */}
                        <div className="mt-3 pl-1">
                          <p className="text-[13px] font-black text-primary uppercase leading-tight">
                            {pilot?.full_name || "PILOT NOT FOUND"}
                          </p>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                            PID: {pilot?.pid || pirep.user_id.slice(0, 8)}
                          </p>
                        </div>
                      </div>
                      <Badge className="font-black uppercase tracking-widest">{pirep.status}</Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div><p className="text-[10px] font-black opacity-50 uppercase">Date</p><p className="font-bold">{pirep.date}</p></div>
                      <div><p className="text-[10px] font-black opacity-50 uppercase">Shift</p><p className="font-bold">{pirep.freq_open_time}Z - {pirep.freq_close_time}Z</p></div>
                      <div>
                        <p className="text-[10px] font-black opacity-50 uppercase">Stations</p>
                        <div className="flex gap-1 mt-1">
                          {pirep.selected_frequencies?.map((f: any) => (
                            <Badge key={f} variant="secondary" className="text-[9px] px-1">{f}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-muted/30 lg:w-72 p-6 flex flex-col justify-between border-l border-border">
                    <div className="text-right">
                      <p className="text-[10px] font-black text-primary uppercase">Total Credit</p>
                      <p className="text-4xl font-black">{finalHours.toFixed(2)}<span className="text-xs ml-1 opacity-50">HRS</span></p>
                    </div>
                    <div className="space-y-2 mt-4">
                      <Button className="w-full bg-success hover:bg-success/90 font-black uppercase h-12" onClick={() => updateStatus.mutate({ pirep, newStatus: "approved" })}>Approve</Button>
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" className="text-destructive font-bold text-[10px] uppercase" onClick={() => updateStatus.mutate({ pirep, newStatus: "rejected" })}>Reject</Button>
                        <Button variant="ghost" className="text-muted-foreground font-bold text-[10px] uppercase" onClick={() => updateStatus.mutate({ pirep, newStatus: "pending" })}>Reset</Button>
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
