import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Radio, ShieldCheck, Zap, Loader2 } from "lucide-react";
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
    queryKey: ["atc_admin_queue"],
    queryFn: async () => {
      // 1. Fetch PIREPs
      const { data: pireps, error: pError } = await supabase
        .from("atc_pireps")
        .select("*")
        .order("created_at", { ascending: false });

      if (pError) throw pError;

      // 2. Fetch ALL pilots to match them
      const { data: pilots, error: plError } = await supabase
        .from("pilots")
        .select("user_id, full_name, pid");

      if (plError) console.error("Pilot Fetch Error:", plError);

      // 3. Manual Merge
      const merged = pireps.map(p => ({
        ...p,
        pilot: pilots?.find(pl => pl.user_id === p.user_id)
      }));

      console.log("Merged Data Sample:", merged[0]);
      return merged;
    }
  });

  const updateStatus = useMutation({
    mutationFn: async ({ pirep, newStatus }: { pirep: any, newStatus: string }) => {
      const oldStatus = pirep.status;
      const hours = calculateDuration(pirep.freq_open_time, pirep.freq_close_time) * (Number(pirep.multiplier) || 1);
      
      await supabase.from("atc_pireps").update({ status: newStatus }).eq("id", pirep.id);

      const { data: pilot } = await supabase.from("pilots").select("total_hours, total_pireps").eq("user_id", pirep.user_id).single();
      if (pilot) {
        let h = Number(pilot.total_hours) || 0;
        let p = Number(pilot.total_pireps) || 0;
        if (newStatus === "approved" && oldStatus !== "approved") { h += hours; p += 1; }
        else if (oldStatus === "approved" && newStatus !== "approved") { h = Math.max(0, h - hours); p = Math.max(0, p - 1); }
        await supabase.from("pilots").update({ total_hours: parseFloat(h.toFixed(2)), total_pireps: p }).eq("user_id", pirep.user_id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["atc_admin_queue"] });
      toast.success("Sync Complete");
    }
  });

  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="p-4 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 border-b pb-4 border-white/10">
        <Radio className="text-primary animate-pulse" />
        <h1 className="text-xl font-black uppercase tracking-tighter">ATC Dispatch</h1>
      </div>

      <div className="grid gap-4">
        {data?.map((item: any) => {
          const hours = calculateDuration(item.freq_open_time, item.freq_close_time) * (item.multiplier || 1);
          
          return (
            <Card key={item.id} className="bg-slate-950/50 border-white/10 overflow-hidden">
              <CardContent className="p-0">
                <div className="flex flex-col md:flex-row">
                  
                  {/* DATA SIDE */}
                  <div className="p-5 flex-1 space-y-5">
                    <div className="flex justify-between items-start">
                      <div>
                        <h2 className="text-4xl font-black font-mono leading-none">{item.airport_icao}</h2>
                        
                        {/* PILOT INFO BOX - High Visibility */}
                        <div className="mt-3 py-1 px-2 bg-white/5 rounded border-l-2 border-primary">
                          <p className="text-[12px] font-black text-white uppercase truncate">
                            {item.pilot?.full_name || `UNKNOWN (${item.user_id.slice(0,8)})`}
                          </p>
                          <p className="text-[10px] font-bold text-primary/80 tracking-widest uppercase">
                            PID: {item.pilot?.pid || "NOT LINKED"}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="font-black uppercase bg-white/5">{item.status}</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-[11px] font-bold uppercase text-muted-foreground">
                      <div><p>Date</p><p className="text-white">{item.date}</p></div>
                      <div><p>Shift</p><p className="text-white">{item.freq_open_time} - {item.freq_close_time}Z</p></div>
                    </div>
                  </div>

                  {/* ACTION SIDE */}
                  <div className="p-5 bg-white/5 md:w-64 border-t md:border-t-0 md:border-l border-white/10 flex flex-col justify-between">
                    <div className="text-right mb-4">
                      <p className="text-[10px] font-black text-primary uppercase">Total Hours</p>
                      <p className="text-3xl font-black">{hours.toFixed(2)}</p>
                    </div>
                    
                    <div className="space-y-2">
                      <Button 
                        className="w-full bg-emerald-600 hover:bg-emerald-500 font-black uppercase"
                        onClick={() => updateStatus.mutate({ pirep: item, newStatus: "approved" })}
                      >
                        {updateStatus.isPending ? <Loader2 className="animate-spin" /> : "Approve"}
                      </Button>
                      <div className="flex gap-2">
                        <Button variant="ghost" className="flex-1 text-[10px] font-bold text-red-400 hover:text-red-300" onClick={() => updateStatus.mutate({ pirep: item, newStatus: "rejected" })}>REJECT</Button>
                        <Button variant="ghost" className="flex-1 text-[10px] font-bold text-slate-400" onClick={() => updateStatus.mutate({ pirep: item, newStatus: "pending" })}>RESET</Button>
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
