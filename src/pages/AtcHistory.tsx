import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Radio, Calendar, History, ShieldCheck, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// Helper to calculate hours (same logic as Admin side for consistency)
const calculateDuration = (open: string, close: string, multiplier: number) => {
  if (!open || !close) return 0;
  try {
    const [startH, startM] = open.split(':').map(Number);
    const [endH, endM] = close.split(':').map(Number);
    let startTotal = startH * 60 + startM;
    let endTotal = endH * 60 + endM;
    if (endTotal < startTotal) endTotal += 24 * 60;
    return ((endTotal - startTotal) / 60) * (multiplier || 1);
  } catch (e) {
    return 0;
  }
};

export default function AtcHistory() {
  const { user, pilot } = useAuth();

  const { data: pireps = [], isLoading } = useQuery({
    queryKey: ["atc-history", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atc_pireps")
        .select("*")
        .eq("user_id", user?.id) // Matches the filing page user_id
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const totalApprovedHours = pireps
    .filter((p: any) => p.status === "approved")
    .reduce((acc: number, p: any) => acc + calculateDuration(p.freq_open_time, p.freq_close_time, p.multiplier), 0);

  return (
    <div className="p-6 space-y-8 max-w-4xl mx-auto animate-in fade-in duration-700">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
            <History size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">ATC History</h1>
            <p className="text-sm text-muted-foreground">Your controller session logs</p>
          </div>
        </div>

        <Card className="bg-primary/5 border-primary/20 min-w-[140px]">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] uppercase font-black text-primary/70 tracking-widest">Total Hours</p>
            <p className="text-2xl font-black">{totalApprovedHours.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* SESSIONS LIST */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : pireps.length === 0 ? (
          <Card className="border-dashed py-12">
            <CardContent className="flex flex-col items-center justify-center text-muted-foreground">
              <Radio className="h-12 w-12 opacity-10 mb-4" />
              <p>No ATC sessions found in your logbook.</p>
            </CardContent>
          </Card>
        ) : (
          pireps.map((pirep: any) => {
            const sessionHours = calculateDuration(pirep.freq_open_time, pirep.freq_close_time, pirep.multiplier);
            
            return (
              <Card key={pirep.id} className="overflow-hidden transition-all hover:border-primary/30 group bg-card">
                <CardContent className="p-0">
                  <div className="flex flex-col sm:flex-row">
                    
                    {/* LEFT SIDE: Status Stripe */}
                    <div className={cn(
                      "w-full sm:w-2 shrink-0 h-2 sm:h-auto",
                      pirep.status === "approved" ? "bg-success" : 
                      pirep.status === "rejected" ? "bg-destructive" : "bg-warning"
                    )} />

                    <div className="p-5 flex-1 space-y-4">
                      {/* TOP ROW: Airport & Badge */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xl font-black font-mono tracking-tighter">{pirep.airport_icao}</span>
                          {pirep.is_supervisor_override && (
                            <Badge variant="outline" className="text-[9px] border-amber-500/50 text-amber-500 bg-amber-500/5">
                              <ShieldCheck size={10} className="mr-1" /> SUPERVISOR
                            </Badge>
                          )}
                        </div>
                        <Badge 
                          variant={pirep.status === 'approved' ? 'success' : 'outline'}
                          className="capitalize font-bold px-3"
                        >
                          {pirep.status}
                        </Badge>
                      </div>

                      {/* MIDDLE ROW: Details */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
                            <Calendar size={12} /> Date
                          </Label>
                          <p className="font-medium">{pirep.date}</p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
                            <Clock size={12} /> Duration
                          </Label>
                          <p className="font-medium">{pirep.freq_open_time} - {pirep.freq_close_time}</p>
                        </div>
                        <div className="space-y-1 col-span-2 sm:col-span-1">
                          <Label className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
                            <Zap size={12} /> Multiplier
                          </Label>
                          <p className="font-medium text-primary">{pirep.multiplier.toFixed(1)}x</p>
                        </div>
                      </div>

                      {/* FREQUENCIES BAR */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {pirep.selected_frequencies?.map((f: string) => (
                          <Badge key={f} variant="secondary" className="text-[10px] bg-muted/50 font-normal">
                            {f}
                          </Badge>
                        ))}
                      </div>

                      {/* BOTTOM ROW: Final Math */}
                      <div className="pt-3 border-t border-border flex justify-between items-center">
                        <span className="text-xs text-muted-foreground italic truncate max-w-[200px]">
                          {pirep.remarks || "No remarks provided"}
                        </span>
                        <div className="text-right">
                          <p className="text-lg font-black">{sessionHours.toFixed(2)} <span className="text-[10px] text-muted-foreground font-normal">HRS</span></p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

// Ensure you have these variants in your Badge component
// or replace 'success' with 'default' and 'warning' with 'secondary'
