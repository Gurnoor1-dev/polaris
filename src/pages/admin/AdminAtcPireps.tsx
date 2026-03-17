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
  if (!open || !close) return "0.00";
  try {
    const [startH, startM] = open.split(':').map(Number);
    const [endH, endM] = close.split(':').map(Number);
    
    const startTotalMinutes = startH * 60 + startM;
    let endTotalMinutes = endH * 60 + endM;

    // Handle overnight shifts
    if (endTotalMinutes < startTotalMinutes) {
      endTotalMinutes += 24 * 60;
    }

    const diff = (endTotalMinutes - startTotalMinutes) / 60;
    return diff.toFixed(2);
  } catch (e) {
    return "Error";
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
    mutationFn: async ({ id, status }: { id: string, status: string }) => {
      const { error } = await supabase
        .from("atc_pireps")
        .update({ status })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["atc_pireps"] });
      toast.success(`PIREP marked as ${variables.status}`);
    },
    onError: () => {
      toast.error("Failed to update status");
    }
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Clock className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-sans">ATC PIREP Management</h1>
          <p className="text-sm text-muted-foreground">Review KEVA controller logs and frequency usage</p>
        </div>
      </div>

      <div className="grid gap-4">
        {data?.map((pirep: any) => {
          const duration = calculateDuration(pirep.freq_open_time, pirep.freq_close_time);
          
          return (
            <Card key={pirep.id} className="overflow-hidden border-primary/10">
              <CardHeader className="bg-muted/30 pb-3">
                <CardTitle className="flex justify-between items-center text-lg">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-primary">{pirep.airport_icao}</span>
                    {pirep.is_supervisor_override && (
                      <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] gap-1 px-1.5">
                        <ShieldCheck size={12} /> SUP
                      </Badge>
                    )}
                  </div>
                  <Badge variant={pirep.status === 'approved' ? 'success' : 'outline'}>
                    {pirep.status.toUpperCase()}
                  </Badge>
                </CardTitle>
              </CardHeader>

              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-tight">Session Date</p>
                    <p className="font-medium">{pirep.date}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-tight">Shift Times (Z)</p>
                    <p className="font-medium">{pirep.freq_open_time} — {pirep.freq_close_time}</p>
                  </div>
                </div>

                {/* --- FREQUENCY EXTENSION SECTION --- */}
                <div className="space-y-2">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-tight flex items-center gap-1">
                    <Radio size={12} /> Controlled Frequencies
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {pirep.selected_frequencies && pirep.selected_frequencies.length > 0 ? (
                      pirep.selected_frequencies.map((f: string) => (
                        <Badge key={f} variant="outline" className="bg-primary/5 border-primary/20 text-[11px] font-medium py-0">
                          {f}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground italic">No frequencies specified</span>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-primary/5 rounded-xl border border-primary/10 flex justify-between items-end">
                  <div>
                    <p className="text-[10px] text-primary/70 uppercase font-black tracking-widest">Logged Time</p>
                    <p className="text-2xl font-black">{duration} <span className="text-xs font-normal">hrs</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Multiplier</p>
                    <p className="text-lg font-bold text-success">{pirep.multiplier}x</p>
                  </div>
                </div>

                {pirep.remarks && (
                  <div className="text-sm bg-muted/20 p-2 rounded border border-dashed">
                    <span className="text-[10px] block font-bold text-muted-foreground uppercase">Remarks</span>
                    {pirep.remarks}
                  </div>
                )}

                {/* --- BUTTON LAYOUT --- */}
                <div className="space-y-3 pt-2 border-t border-white/5">
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      className="w-full bg-success/5 border-success/20 text-success hover:bg-success/20"
                      onClick={() => updateStatus.mutate({ id: pirep.id, status: "approved" })}
                    >
                      <Check className="mr-2" size={18}/> Approve
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full bg-destructive/5 border-destructive/20 text-destructive hover:bg-destructive/20"
                      onClick={() => updateStatus.mutate({ id: pirep.id, status: "rejected" })}
                    >
                      <X className="mr-2" size={18}/> Reject
                    </Button>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground hover:bg-muted font-normal h-8 text-xs"
                    onClick={() => updateStatus.mutate({ id: pirep.id, status: "pending" })}
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
        <div className="text-center py-20 text-muted-foreground">
          <Clock className="mx-auto h-12 w-12 opacity-20 mb-4" />
          <p>No ATC PIREPs awaiting review.</p>
        </div>
      )}
    </div>
  );
}
