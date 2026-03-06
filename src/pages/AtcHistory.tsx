import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, TowerControl, Calendar } from "lucide-react";

export default function AtcHistory() {
  const { pilot } = useAuth();

  const { data: pireps = [], isLoading } = useQuery({
    queryKey: ["atc-history", pilot?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("atc_pireps")
        .select("*")
        .eq("pilot_id", pilot?.id)
        .order("created_at", { ascending: false });

      return data ?? [];
    },
    enabled: !!pilot,
  });

  return (
    <div className="p-6 space-y-6">

      <div className="flex items-center gap-2">
        <TowerControl className="h-5 w-5" />
        <h1 className="text-xl font-semibold">ATC History</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your ATC Sessions</CardTitle>
        </CardHeader>

        <CardContent>

          {isLoading && (
            <p className="text-sm text-muted-foreground">Loading...</p>
          )}

          {!isLoading && pireps.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No ATC sessions filed yet.
            </p>
          )}

          <div className="space-y-3">

            {pireps.map((pirep: any) => (
              <div
                key={pirep.id}
                className="border rounded-lg p-4 flex items-center justify-between"
              >
                <div className="space-y-1">

                  <div className="flex items-center gap-2 font-medium">
                    <TowerControl className="h-4 w-4" />
                    {pirep.airport_icao}
                  </div>

                  <div className="text-sm text-muted-foreground flex items-center gap-3">

                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {pirep.date}
                    </span>

                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {pirep.frequency_opening_time} - {pirep.frequency_closing_time}
                    </span>

                  </div>

                </div>

                <div className="flex items-center gap-4">

                  <div className="text-sm font-medium">
                    {pirep.calculated_hours?.toFixed(2)} hrs
                  </div>

                  <Badge
                    variant={
                      pirep.status === "approved"
                        ? "default"
                        : pirep.status === "rejected"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {pirep.status}
                  </Badge>

                </div>
              </div>
            ))}

          </div>

        </CardContent>
      </Card>
    </div>
  );
}
