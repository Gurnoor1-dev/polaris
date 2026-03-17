import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, Pause, Clock } from "lucide-react";
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

    // Handle overnight shifts (e.g., 23:00 to 01:00)
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
          <h1 className="text-2xl font-bold">ATC PIREPs</h1>
          <p className="text-sm text-muted-foreground">Review and approve KEVA controller sessions</p>
        </div>
      </div>

      <div className="grid gap-4">
        {data?.map((pirep: any) => {
          const duration = calculateDuration(pirep.freq_open_time, pirep.freq_close_time);
          
          return (
            <Card key={pirep.id} className="overflow-hidden">
              <CardHeader className="bg-muted/30 pb-3">
                <CardTitle className="flex justify-between items-center text-lg">
                  <span className="font-mono">{pirep.airport_icao}</span>
                  <Badge variant={pirep.status === 'approved' ? 'success' : 'outline'}>
                    {pirep.status.toUpperCase()}
                  </Badge>
                </CardTitle>
              </CardHeader>

              <CardContent className="pt-4 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Date:</span> {pirep.date}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Multiplier:</span> {pirep.multiplier}x
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Shift:</span> {pirep.freq_open_time} — {pirep.freq_close_time}
                  </div>
                </div>

                <div className="p-3 bg-primary/5 rounded-md border border-primary/10">
                  <div className="text-xs text-primary/70 uppercase font-bold tracking-wider">Calculated Session Hours</div>
                  <div className="text-xl font-bold">{duration} hrs</div>
                  <div className="text-xs text-muted-foreground mt-1 italic">
                    (Multiplier applied: {(Number(duration) * pirep.multiplier).toFixed(2)} hrs)
                  </div>
                </div>

                {pirep.remarks && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Remarks:</span> {pirep.remarks}
                  </div>
                )}

                                {/* --- FUTURE FEATURE UPDATE SPACE START --- */}
                <div className="mt-4 pt-4 border-t border-dashed border-muted-foreground/20">
                    <p className="text-[10px] text-muted-foreground/50 uppercase text-center tracking-widest">
                        Future Extension Slot
                    </p>
                </div>
                {/* --- FUTURE FEATURE UPDATE SPACE END --- */}

                {/* --- PERFECT BUTTON LAYOUT START --- */}
                <div className="space-y-3 pt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      className="w-full bg-success/5 border-success/20 text-success hover:bg-success/20 hover:text-success"
                      onClick={() => updateStatus.mutate({ id: pirep.id, status: "approved" })}
                    >
                      <Check className="mr-2" size={18}/> Approve
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full bg-destructive/5 border-destructive/20 text-destructive hover:bg-destructive/20 hover:text-destructive"
                      onClick={() => updateStatus.mutate({ id: pirep.id, status: "rejected" })}
                    >
                      <X className="mr-2" size={18}/> Reject
                    </Button>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground hover:bg-muted font-normal h-8"
                    onClick={() => updateStatus.mutate({ id: pirep.id, status: "pending" })}
                  >
                    <Pause className="mr-2" size={14}/> Reset to Pending
                  </Button>
                </div>
                {/* --- PERFECT BUTTON LAYOUT END --- */}
                
                {/* --- FIX END --- */}
              </CardContent>
            </Card>
          );
        })}
      </div>
      
      {data?.length === 0 && !isLoading && (
        <div className="text-center py-20 text-muted-foreground">
          No ATC PIREPs found.
        </div>
      )}
    </div>
  );
}
