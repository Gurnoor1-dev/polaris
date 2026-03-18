import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, Pause, Clock, Radio, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

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
      const { data, error } = await supabase
        .from("atc_pireps")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const updateStatus = useMutation({
    mutationFn: async ({ pirep, newStatus }: { pirep: any, newStatus: string }) => {
      const oldStatus = pirep.status;

      // 1. If it's already approved and we are approving again, STOP.
      if (oldStatus === "approved" && newStatus === "approved") return;

      // 2. Update the PIREP status in the DB
      const { error: pirepError } = await supabase
        .from("atc_pireps")
        .update({ status: newStatus })
        .eq("id", pirep.id);

      if (pirepError) throw pirepError;

      // 3. LOGIC: Only add hours if moving FROM (Pending/Rejected) TO (Approved)
      if (newStatus === "approved" && oldStatus !== "approved") {
        const hoursToAdd = calculateDuration(pirep.freq_open_time, pirep.freq_close_time) * (Number(pirep.multiplier) || 1);

        // RPC is safest, but using a single update with current data fetch
        const { data: pilot } = await supabase.from("pilots").select("total_hours, total_pireps").eq("user_id", pirep.user_id).single();
        
        await supabase.from("pilots").update({ 
          total_hours: (Number(pilot?.total_hours) || 0) + hoursToAdd,
          total_pireps: (Number(pilot?.total_pireps) || 0) + 1 
        }).eq("user_id", pirep.user_id);
      }

      // 4. LOGIC: If moving FROM (Approved) TO (Pending/Rejected), SUBTRACT the hours
      if (oldStatus === "approved" && newStatus !== "approved") {
        const hoursToSub = calculateDuration(pirep.freq_open_time, pirep.freq_close_time) * (Number(pirep.multiplier) || 1);
        const { data: pilot } = await supabase.from("pilots").select("total_hours, total_pireps").eq("user_id", pirep.user_id).single();
        
        await supabase.from("pilots").update({ 
          total_hours: Math.max(0, (Number(pilot?.total_hours) || 0) - hoursToSub),
          total_pireps: Math.max(0, (Number(pilot?.total_pireps) || 0) - 1) 
        }).eq("user_id", pirep.user_id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["atc_pireps"] });
      toast.success("PIREP updated successfully");
    }
  });

  if (isLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-black uppercase tracking-tight">ATC Admin</h1>
      <div className="grid gap-6">
        {data?.map((pirep: any) => {
          const hours = calculateDuration(pirep.freq_open_time, pirep.freq_close_time) * pirep.multiplier;
          return (
            <Card key={pirep.id} className="bg-card border-border shadow-sm">
              <CardContent className="p-6 space-y-4">
                <div className="flex justify-between items-center border-b pb-3">
                  <span className="text-2xl font-black font-mono text-primary">{pirep.airport_icao}</span>
                  <Badge variant={pirep.status === 'approved' ? 'success' : 'outline'}>{pirep.status.toUpperCase()}</Badge>
                </div>

                <div className="flex justify-between items-end">
                   <div>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Session Credit</p>
                      <p className="text-2xl font-black">{hours.toFixed(2)} hrs</p>
                      <p className="text-xs text-muted-foreground italic">({pirep.multiplier}x Multiplier Applied)</p>
                   </div>
                   <div className="flex flex-col gap-2 w-48">
                      <Button 
                        size="sm" variant="outline" className="bg-success/10 text-success hover:bg-success hover:text-white"
                        onClick={() => updateStatus.mutate({ pirep, newStatus: "approved" })}
                        disabled={pirep.status === 'approved'}
                      >Approve</Button>
                      
                      <Button 
                        size="sm" variant="outline" className="bg-destructive/10 text-destructive hover:bg-destructive hover:text-white"
                        onClick={() => updateStatus.mutate({ pirep, newStatus: "rejected" })}
                        disabled={pirep.status === 'rejected'}
                      >Reject</Button>

                      <Button 
                        size="sm" variant="ghost" className="text-[10px]"
                        onClick={() => updateStatus.mutate({ pirep, newStatus: "pending" })}
                      >Reset</Button>
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
