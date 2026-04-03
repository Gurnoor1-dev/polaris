import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Route, Search, Plane, FileText } from "lucide-react";
import { splitRouteAircraft, getPrimaryAircraft } from "@/lib/routeAircraft";

// ─── Aircraft ICAO → Display name ───────────────────────────────────────────
const AIRCRAFT_DISPLAY: Record<string, string> = {
  BCS3:  "A220-300",
  A319:  "A319",
  A320:  "A320",
  A321:  "A321",
  A333:  "A330-300",
  A339:  "A330-900",
  A35K:  "A350",
  A388:  "A380",
  B737:  "737-700",
  B38M:  "737 MAX 8",
  B738:  "737-800",
  B739:  "737-900",
  B744:  "747-400",
  B748:  "747-8",
  B752:  "757-200",
  B763:  "767-300",
  B772:  "777-200ER",
  B77L:  "777-200LR",
  B77W:  "777-300ER",
  B77F:  "777F",
  B781:  "787-10",
  B788:  "787-8",
  B789:  "787-9",
  DH8D:  "Dash 8-Q400",
  CRJ2:  "CRJ-200",
  CRJ9:  "CRJ-900",
  E175:  "E175",
  E190:  "E190",
  MD11:  "MD-11",
};

const AIRCRAFT_ICAO_CODES = Object.keys(AIRCRAFT_DISPLAY).sort();

const rankLabels: Record<string, string> = {
  cadet:          "Cadet",
  first_officer:  "First Officer",
  captain:        "Captain",
  senior_captain: "Senior Captain",
  commander:      "Commander",
};

const PAGE_SIZE = 50;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatFlightTime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function AircraftBadges({ icaoString }: { icaoString: string }) {
  const codes = splitRouteAircraft(icaoString);
  if (!codes.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {codes.map((code) => (
        <span
          key={code}
          className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs font-mono"
        >
          <Plane className="h-2.5 w-2.5 text-muted-foreground" />
          {AIRCRAFT_DISPLAY[code] ?? code}
        </span>
      ))}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function RoutesPage() {
  const { pilot } = useAuth();
  const navigate = useNavigate();

  const [depFilter,      setDepFilter]      = useState("");
  const [arrFilter,      setArrFilter]      = useState("");
  const [aircraftFilter, setAircraftFilter] = useState("all");
  const [typeFilter,     setTypeFilter]     = useState("all");
  const [page,           setPage]           = useState(1);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: routes, isLoading } = useQuery({
    queryKey: ["routes"],
    queryFn: async () => {
      const { fetchAllRows } = await import("@/lib/fetchAllRows");
      return fetchAllRows("routes", {
        filters: (q: any) => q.eq("is_active", true),
        orderColumn: "route_number",
      });
    },
  });

  const { data: recentPireps } = useQuery({
    queryKey: ["pilot-recent-approved-pireps", pilot?.id],
    queryFn: async () => {
      if (!pilot?.id) return [];
      const { data } = await supabase
        .from("pireps")
        .select("dep_icao, arr_icao, aircraft_icao")
        .eq("pilot_id", pilot.id)
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(40);
      return data || [];
    },
    enabled: !!pilot?.id,
  });

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filteredRoutes = useMemo(() => {
    return routes?.filter((route) => {
      if (depFilter && !route.dep_icao.includes(depFilter.toUpperCase())) return false;
      if (arrFilter && !route.arr_icao.includes(arrFilter.toUpperCase())) return false;
      if (aircraftFilter !== "all" && !splitRouteAircraft(route.aircraft_icao).includes(aircraftFilter)) return false;
      if (typeFilter !== "all" && route.route_type !== typeFilter) return false;
      return true;
    });
  }, [routes, depFilter, arrFilter, aircraftFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil((filteredRoutes?.length ?? 0) / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const pagedRoutes = (filteredRoutes ?? []).slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => setPage(1), [depFilter, arrFilter, aircraftFilter, typeFilter]);

  // ── Recommendations ───────────────────────────────────────────────────────
  const recommendedRoutes = useMemo(() => {
    if (!routes?.length || !pilot) return [] as typeof routes;

    const depCount: Record<string, number>      = {};
    const arrCount: Record<string, number>      = {};
    const aircraftCount: Record<string, number> = {};

    for (const p of recentPireps ?? []) {
      if (p.dep_icao)      depCount[p.dep_icao]           = (depCount[p.dep_icao]           ?? 0) + 1;
      if (p.arr_icao)      arrCount[p.arr_icao]           = (arrCount[p.arr_icao]           ?? 0) + 1;
      if (p.aircraft_icao) aircraftCount[p.aircraft_icao] = (aircraftCount[p.aircraft_icao] ?? 0) + 1;
    }

    return [...routes]
      .filter((r) => r.is_active)
      .map((r) => {
        const depScore  = depCount[r.dep_icao] ?? 0;
        const arrScore  = arrCount[r.arr_icao] ?? 0;
        const acScore   = splitRouteAircraft(r.aircraft_icao)
          .reduce((s, code) => s + (aircraftCount[code] ?? 0), 0);
        const rankScore = r.min_rank === pilot.current_rank ? 2 : 0;
        return { ...r, _score: depScore * 2 + arrScore * 2 + acScore * 3 + rankScore };
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, 6);
  }, [routes, recentPireps, pilot]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleFilePirep = (route: any) => {
    const primary = getPrimaryAircraft(route.aircraft_icao);
    navigate(
      `/file-pirep?dep=${route.dep_icao}&arr=${route.arr_icao}&aircraft=${primary}` +
      `&flight=${route.route_number}&type=${route.route_type}`
    );
  };

  const clearFilters = () => {
    setDepFilter("");
    setArrFilter("");
    setAircraftFilter("all");
    setTypeFilter("all");
    setPage(1);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Route className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Route Database</h1>
          <p className="text-muted-foreground">Browse available routes and file PIREPs</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-5">
            {/* Departure */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Departure</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="ICAO"
                  value={depFilter}
                  onChange={(e) => setDepFilter(e.target.value)}
                  className="pl-9 uppercase"
                  maxLength={4}
                />
              </div>
            </div>

            {/* Arrival */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Arrival</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="ICAO"
                  value={arrFilter}
                  onChange={(e) => setArrFilter(e.target.value)}
                  className="pl-9 uppercase"
                  maxLength={4}
                />
              </div>
            </div>

            {/* Aircraft */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Aircraft</label>
              <Select value={aircraftFilter} onValueChange={setAircraftFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All aircraft" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Aircraft</SelectItem>
                  {AIRCRAFT_ICAO_CODES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {AIRCRAFT_DISPLAY[code] ?? code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Type */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="passenger">Passenger</SelectItem>
                  <SelectItem value="cargo">Cargo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Clear */}
            <div className="flex items-end">
              <Button variant="outline" onClick={clearFilters} className="w-full">
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      {recommendedRoutes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommended for You</CardTitle>
            <CardDescription>
              Based on your recent approved flights, rank, and aircraft preference
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {recommendedRoutes.map((route) => (
                <div
                  key={`rec-${route.id}`}
                  className="rounded-md border p-3 space-y-2"
                >
                  <p className="font-semibold text-sm">{route.route_number}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {route.dep_icao} → {route.arr_icao}
                  </p>
                  <AircraftBadges icaoString={route.aircraft_icao} />
                  <p className="text-xs text-muted-foreground">
                    {formatFlightTime(route.est_flight_time_minutes)}
                  </p>
                  <Button size="sm" variant="outline" onClick={() => handleFilePirep(route)}>
                    <FileText className="h-3 w-3 mr-1" />
                    File PIREP
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Routes Table */}
      <Card>
        <CardHeader>
          <CardTitle>Available Routes</CardTitle>
          <CardDescription>
            {filteredRoutes?.length ?? 0} routes found &bull; Page {safePage} of {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : pagedRoutes.length > 0 ? (
            <>
              <div className="relative overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-3 px-2 font-medium">Flight</th>
                      <th className="text-left py-3 px-2 font-medium">Dep</th>
                      <th className="text-left py-3 px-2 font-medium">Arr</th>
                      <th className="text-left py-3 px-2 font-medium">Aircraft</th>
                      <th className="text-left py-3 px-2 font-medium">Est. Time</th>
                      <th className="text-left py-3 px-2 font-medium">Type</th>
                      <th className="text-left py-3 px-2 font-medium">Min Rank</th>
                      <th className="text-left py-3 px-2 font-medium">Notes</th>
                      <th className="text-right py-3 px-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRoutes.map((route) => (
                      <tr
                        key={route.id}
                        className="border-b last:border-0 hover:bg-muted/40 transition-colors"
                      >
                        <td className="py-3 px-2 font-semibold font-mono">
                          {route.route_number}
                        </td>
                        <td className="py-3 px-2 font-mono">{route.dep_icao}</td>
                        <td className="py-3 px-2 font-mono">{route.arr_icao}</td>
                        <td className="py-3 px-2">
                          <AircraftBadges icaoString={route.aircraft_icao} />
                        </td>
                        <td className="py-3 px-2 tabular-nums text-muted-foreground">
                          {formatFlightTime(route.est_flight_time_minutes)}
                        </td>
                        <td className="py-3 px-2">
                          <Badge variant="secondary" className="capitalize">
                            {route.route_type}
                          </Badge>
                        </td>
                        <td className="py-3 px-2">
                          <Badge variant="outline" className="capitalize whitespace-nowrap">
                            {rankLabels[route.min_rank] ?? route.min_rank}
                          </Badge>
                        </td>
                        <td className="py-3 px-2 text-muted-foreground max-w-[180px] truncate text-xs">
                          {route.notes || "—"}
                        </td>
                        <td className="py-3 px-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleFilePirep(route)}
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            File PIREP
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {(safePage - 1) * PAGE_SIZE + 1}–
                    {Math.min(safePage * PAGE_SIZE, filteredRoutes?.length ?? 0)} of{" "}
                    {filteredRoutes?.length ?? 0} routes
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <Route className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium">No routes found</p>
              <p className="text-sm mt-1">Try adjusting or clearing your filters</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                Clear Filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
