import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, Pause, Clock, Radio, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

// Helper to calculate hours between two time strings (HH:mm)
const calculateDuration = (open: string, close: string) => {
  if (!open || !close) return 0;
  try {
    const [startH, startM] = open.split(':').map(Number);
    const [endH, endM] = close.split(':').map(Number);
    
    const startTotalMinutes = startH * 60 + startM;
    let endTotalMinutes = endH * 60 + endM;

    if (endTotalMinutes < startTotalMinutes) {
      endTotalMinutes += 24 * 60;
    }

    return (endTotalMinutes - startTotalMinutes) / 60;
  } catch (e) {
    return 0;
  }
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
    mutationFn: async ({ id, status, userId, hoursToAdd }: { id: string, status: string, userId: string, hoursToAdd: number }) => {
      // 1. Update the PIREP status first
      const { error: pirepError } = await supabase
        .from("atc_pireps")
        .update({ status })
        .eq("id", id);

      if (pirepError) throw pirepError;

      // 2. If approving, update the pilot's totals in the "pilots" table
      if (status === "approved") {
        // Fetch current stats using user_id
        const { data: pilot, error: fetchError } = await supabase
          .from("pilots")
          .select("total_hours, total_pireps")
          .eq("user_id", userId) 
          .single();

        if (fetchError) throw fetchError;

        // Calculate new values (Safe fallback to 0 if null)
        const currentHours = Number(pilot?.total_hours) || 0;
        const currentPireps = Number(pilot?.total_pireps) || 0;
        
        const newHours = currentHours + hoursToAdd;
        const newPireps = currentPireps + 1;

        const { error: updateError } = await supabase
          .from("pilots")
          .update({ 
            total_hours: newHours,
            total_pireps: newPireps 
          })
          .eq("user_id", userId);

        if (updateError) throw updateError;
      }
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["atc_pireps"] });
      toast.success(
        variables.status === "approved" 
        ? `Success! +${variables.hoursToAdd.toFixed(2)} hrs added to Pilot profile.`
        : `PIREP marked as ${variables.status}`
      );
    },
    onError: (error: any) => {
      console.error("Critical Update Error:", error);
      toast.error("Database Update Failed: " + (error.message || "Unknown Error"));
    }
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm">
          <Clock className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight uppercase">ATC Admin Dispatch</h1>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Validate controller logs & credit hours</p>
        </div>
      </div>

      <div className="grid gap-6">
        {data?.map((pirep: any) => {
          const rawDuration = calculateDuration(pirep.freq_open_time, pirep.freq_close_time);
          const finalHours = rawDuration * (Number(pirep.multiplier) || 1);
          
          return (
            <Card key={pirep.id} className="overflow-hidden border-border bg-card/50 backdrop-blur-sm shadow-md transition-all hover:shadow-lg">
              <CardHeader className="bg-muted/20 pb-3 border-b border-border/50">
                <CardTitle className="flex justify-between items-center text-lg">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-black text-2xl text-primary tracking-tighter">{pirep.airport_icao}</span>
                    {pirep.is_supervisor_override && (
                      <Badge variant="outline" className="border-amber-500/50 text-amber-600 bg-amber-500/5 text-[10px] font-bold px-2 py-0">
                        <ShieldCheck size={12} className="mr-1" /> SUP
                      </Badge>
                    )}
                  </div>
                  <Badge 
                    variant={pirep.status === 'approved' ? 'success' : pirep.status === 'rejected' ? 'destructive' : 'outline'}
                    className="uppercase font-black px-4 py-1"
                  >
                    {pirep.status}
                  </Badge>
                </CardTitle>
              </CardHeader>

              <CardContent className="pt-6 space-y-6 text-foreground">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Date</p>
                    <p className="font-bold text-sm">{pirep.date}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Shift (Z)</p>
                    <p className="font-bold text-sm">{pirep.freq_open_time} — {pirep.freq_close_time}</p>
                  </div>
                  <div className="col-span-2 md:col-span-1 space-y-2">
                     <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Frequencies</p>
                     <div className="flex flex-wrap gap-1">
                        {pirep.selected_frequencies?.map((f: string) => (
                          <Badge key={f} variant="secondary" className="text-[9px] font-bold bg-primary/5 text-primary border-primary/10">
                            {f}
                          </Badge>
                        ))}
                     </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-primary/10 bg-primary/[0.03] flex justify-between items-center">
                  <div className="space-y-1">
                    <p className="text-[10px] text-primary/70 uppercase font-black tracking-widest">Hours To Credit</p>
                    <p className="text-3xl font-black">{finalHours.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">hrs</span></p>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="bg-background/50 font-mono text-success border-success/30 text-sm font-bold">
                      {pirep.multiplier}x
                    </Badge>
                  </div>
                </div>

                {pirep.remarks && (
                  <div className="text-xs bg-muted/30 p-3 rounded-xl border border-border italic text-muted-foreground">
                    <span className="not-italic font-bold block mb-1 text-foreground/70">Controller Remarks:</span>
                    "{pirep.remarks}"
                  </div>
                )}

                <div className="space-y-3 pt-4 border-t border-border">
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      className="w-full bg-success/5 border-success/20 text-success hover:bg-success hover:text-white transition-all font-bold"
                      onClick={() => updateStatus.mutate({ 
                        id: pirep.id, 
                        status: "approved", 
                        userId: pirep.user_id, 
                        hoursToAdd: finalHours 
                      })}
                      disabled={pirep.status === 'approved'}
                    >
                      <Check className="mr-2" size={18}/> Approve & Credit
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full bg-destructive/5 border-destructive/20 text-destructive hover:bg-destructive hover:text-white transition-all font-bold"
                      onClick={() => updateStatus.mutate({ 
                        id: pirep.id, 
                        status: "rejected", 
                        userId: pirep.user_id, 
                        hoursToAdd: 0 
                      })}
                      disabled={pirep.status === 'rejected'}
                    >
                      <X className="mr-2" size={18}/> Reject
                    </Button>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground hover:bg-muted font-medium h-9 text-xs uppercase"
                    onClick={() => updateStatus.mutate({ 
                      id: pirep.id, 
                      status: "pending", 
                      userId: pirep.user_id, 
                      hoursToAdd: 0 
                    })}
                  >
                    <Pause className="mr-2" size={14}/> Reset to Pending
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      
      {data?.length === 0 && !isLoading && (
        <div className="text-center py-32 border-2 border-dashed rounded-3xl opacity-30">
          <Clock className="mx-auto h-12 w-12 mb-4" />
          <p className="font-bold uppercase tracking-widest text-sm">Inbox Zero. Great job.</p>
        </div>
      )}
    </div>
  );
}
