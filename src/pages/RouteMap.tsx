import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Plane,
  FileText,
  Search,
  X,
  MapPin,
  ArrowRight,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Globe2,
  Layers,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getPrimaryAircraft, splitRouteAircraft } from "@/lib/routeAircraft";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface AirportNode {
  icao: string;
  outbound: any[];
  inbound: any[];
}

const ROUTES_PER_PAGE = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const formatFlightTime = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
};

const rankLabels: Record<string, string> = {
  cadet: "Cadet",
  first_officer: "First Officer",
  captain: "Captain",
  senior_captain: "Senior Captain",
  commander: "Commander",
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function RouteCard({
  route,
  perspective,
  onFilePirep,
  animIndex,
}: {
  route: any;
  perspective: "outbound" | "inbound";
  onFilePirep: (r: any) => void;
  animIndex: number;
}) {
  const isOut = perspective === "outbound";
  const from = isOut ? route.dep_icao : route.arr_icao;
  const to = isOut ? route.arr_icao : route.dep_icao;

  return (
    <div
      className="route-card group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 transition-all duration-300 hover:border-sky-400/40 hover:bg-white/10 hover:shadow-[0_0_24px_rgba(56,189,248,0.12)]"
      style={{ animationDelay: `${animIndex * 60}ms` }}
    >
      {/* Glow accent */}
      <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <div className="absolute top-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-sky-400/50 to-transparent" />
      </div>

      <div className="flex items-start justify-between gap-3">
        {/* Route info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-xs font-bold text-sky-400 bg-sky-400/10 px-2 py-0.5 rounded-md">
              {route.route_number}
            </span>
            <Badge
              variant="secondary"
              className="text-[10px] capitalize bg-white/10 text-white/60 border-0"
            >
              {route.route_type}
            </Badge>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <span className="font-mono font-bold text-lg text-white">{from}</span>
            <div className="flex items-center gap-1 text-white/40">
              {isOut ? (
                <ArrowRight className="h-4 w-4 text-sky-400" />
              ) : (
                <ArrowLeft className="h-4 w-4 text-amber-400" />
              )}
            </div>
            <span className="font-mono font-bold text-lg text-white">{to}</span>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50">
            <span className="flex items-center gap-1">
              <Plane className="h-3 w-3" />
              {splitRouteAircraft(route.aircraft_icao).join(", ") || "—"}
            </span>
            <span className="flex items-center gap-1">
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {formatFlightTime(route.est_flight_time_minutes)}
            </span>
            {route.min_rank && (
              <span className="text-white/40">
                {rankLabels[route.min_rank] || route.min_rank}
              </span>
            )}
          </div>

          {route.notes && (
            <p className="mt-2 text-xs text-white/30 truncate">{route.notes}</p>
          )}
        </div>

        {/* File PIREP button */}
        <Button
          size="sm"
          onClick={() => onFilePirep(route)}
          className="shrink-0 h-8 px-3 text-xs font-semibold bg-sky-500/20 hover:bg-sky-500 border border-sky-500/30 hover:border-sky-500 text-sky-300 hover:text-white transition-all duration-200 shadow-none"
        >
          <FileText className="h-3 w-3 mr-1.5" />
          File PIREP
        </Button>
      </div>
    </div>
  );
}

function AirportPanel({
  airport,
  onClose,
  onFilePirep,
}: {
  airport: AirportNode;
  onClose: () => void;
  onFilePirep: (r: any) => void;
}) {
  const [tab, setTab] = useState<"outbound" | "inbound">("outbound");
  const [outPage, setOutPage] = useState(1);
  const [inPage, setInPage] = useState(1);

  const routes = tab === "outbound" ? airport.outbound : airport.inbound;
  const page = tab === "outbound" ? outPage : inPage;
  const setPage = tab === "outbound" ? setOutPage : setInPage;
  const totalPages = Math.max(1, Math.ceil(routes.length / ROUTES_PER_PAGE));
  const paged = routes.slice((page - 1) * ROUTES_PER_PAGE, page * ROUTES_PER_PAGE);

  // Reset page when switching tab
  const handleTab = (t: "outbound" | "inbound") => {
    setTab(t);
  };

  return (
    <div className="airport-panel flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4 border-b border-white/10">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/20">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tighter text-white font-display">
                {airport.icao}
              </h2>
              <p className="text-xs text-white/40 mt-0.5">
                {airport.outbound.length} departing · {airport.inbound.length} arriving
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-lg bg-white/5">
          <button
            onClick={() => handleTab("outbound")}
            className={cn(
              "flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition-all duration-200 flex items-center justify-center gap-1.5",
              tab === "outbound"
                ? "bg-sky-500 text-white shadow-[0_2px_8px_rgba(14,165,233,0.4)]"
                : "text-white/50 hover:text-white/80"
            )}
          >
            <ArrowRight className="h-3 w-3" />
            Departing ({airport.outbound.length})
          </button>
          <button
            onClick={() => handleTab("inbound")}
            className={cn(
              "flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition-all duration-200 flex items-center justify-center gap-1.5",
              tab === "inbound"
                ? "bg-amber-500 text-white shadow-[0_2px_8px_rgba(245,158,11,0.4)]"
                : "text-white/50 hover:text-white/80"
            )}
          >
            <ArrowLeft className="h-3 w-3" />
            Arriving ({airport.inbound.length})
          </button>
        </div>
      </div>

      {/* Route list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2.5 scrollbar-thin">
        {paged.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-white/30">
            <Plane className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">No routes found</p>
          </div>
        ) : (
          paged.map((route, i) => (
            <RouteCard
              key={route.id}
              route={route}
              perspective={tab}
              onFilePirep={onFilePirep}
              animIndex={i}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="shrink-0 px-6 py-4 border-t border-white/10 flex items-center justify-between">
          <span className="text-xs text-white/40">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="h-7 w-7 p-0 text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const p = totalPages <= 5 ? i + 1 : Math.max(1, Math.min(page - 2 + i, totalPages - 4 + i));
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    "h-7 w-7 rounded-md text-xs font-semibold transition-all",
                    p === page
                      ? "bg-sky-500 text-white"
                      : "text-white/50 hover:text-white hover:bg-white/10"
                  )}
                >
                  {p}
                </button>
              );
            })}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="h-7 w-7 p-0 text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function RouteMap() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedAirport, setSelectedAirport] = useState<AirportNode | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: routes, isLoading } = useQuery({
    queryKey: ["routes-map"],
    queryFn: async () => {
      const { fetchAllRows } = await import("@/lib/fetchAllRows");
      return fetchAllRows("routes", {
        filters: (q: any) => q.eq("is_active", true),
        orderColumn: "route_number",
      });
    },
  });

  // ── Build airport map ──────────────────────────────────────────────────────
  const airportMap = useMemo<Map<string, AirportNode>>(() => {
    const map = new Map<string, AirportNode>();
    if (!routes) return map;
    for (const route of routes) {
      const dep = route.dep_icao as string;
      const arr = route.arr_icao as string;
      if (!map.has(dep)) map.set(dep, { icao: dep, outbound: [], inbound: [] });
      if (!map.has(arr)) map.set(arr, { icao: arr, outbound: [], inbound: [] });
      map.get(dep)!.outbound.push(route);
      map.get(arr)!.inbound.push(route);
    }
    return map;
  }, [routes]);

  const airports = useMemo(() => {
    return Array.from(airportMap.values()).sort((a, b) => {
      const totalA = a.outbound.length + a.inbound.length;
      const totalB = b.outbound.length + b.inbound.length;
      return totalB - totalA;
    });
  }, [airportMap]);

  const filteredAirports = useMemo(() => {
    if (!search.trim()) return airports;
    return airports.filter((a) => a.icao.toLowerCase().includes(search.toLowerCase()));
  }, [airports, search]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSelectAirport = (airport: AirportNode) => {
    setSelectedAirport(airport);
    setPanelVisible(true);
  };

  const handleClosePanel = () => {
    setPanelVisible(false);
    setTimeout(() => setSelectedAirport(null), 300);
  };

  const handleFilePirep = (route: any) => {
    const primaryAircraft = getPrimaryAircraft(route.aircraft_icao);
    navigate(
      `/file-pirep?dep=${route.dep_icao}&arr=${route.arr_icao}&aircraft=${primaryAircraft}&flight=${route.route_number}&type=${route.route_type}`
    );
  };

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    return {
      totalAirports: airports.length,
      totalRoutes: routes?.length || 0,
      busiest: airports[0]?.icao || "—",
    };
  }, [airports, routes]);

  return (
    <>
      {/* ── Global styles ──────────────────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Bebas+Neue&family=JetBrains+Mono:wght@400;600&display=swap');

        .font-display { font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.05em; }
        .font-mono-custom { font-family: 'JetBrains Mono', monospace; }

        .route-map-bg {
          background: #040c18;
          background-image:
            radial-gradient(ellipse 80% 50% at 50% -20%, rgba(14,165,233,0.08) 0%, transparent 70%),
            radial-gradient(ellipse 50% 50% at 80% 80%, rgba(139,92,246,0.05) 0%, transparent 60%),
            url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='g' width='60' height='60' patternUnits='userSpaceOnUse'%3E%3Cpath d='M 60 0 L 0 0 0 60' fill='none' stroke='rgba(255,255,255,0.03)' stroke-width='0.5'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='url(%23g)'/%3E%3C/svg%3E");
          min-height: 100vh;
        }

        .airport-chip {
          transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
          cursor: pointer;
          position: relative;
          overflow: hidden;
        }
        .airport-chip::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, rgba(14,165,233,0.15), transparent 70%);
          opacity: 0;
          transition: opacity 0.3s;
        }
        .airport-chip:hover::before { opacity: 1; }
        .airport-chip:hover {
          transform: translateY(-2px) scale(1.02);
          border-color: rgba(14, 165, 233, 0.5) !important;
          box-shadow: 0 8px 24px rgba(14,165,233,0.2), 0 0 0 1px rgba(14,165,233,0.2);
        }
        .airport-chip.selected {
          border-color: rgba(14, 165, 233, 0.7) !important;
          background: rgba(14, 165, 233, 0.12) !important;
          box-shadow: 0 0 24px rgba(14,165,233,0.25), 0 0 0 1px rgba(14,165,233,0.4);
        }

        .side-panel {
          transform: translateX(100%);
          transition: transform 0.4s cubic-bezier(0.32, 0.72, 0, 1);
        }
        .side-panel.open {
          transform: translateX(0);
        }

        .route-card {
          animation: cardIn 0.3s ease both;
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .airport-panel {
          animation: panelIn 0.35s cubic-bezier(0.34, 1.2, 0.64, 1) both;
        }
        @keyframes panelIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }

        .stat-card {
          animation: fadeUp 0.5s ease both;
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .scrollbar-thin::-webkit-scrollbar { width: 4px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }

        .loading-dot {
          animation: pulse 1.4s ease-in-out infinite both;
        }
        .loading-dot:nth-child(2) { animation-delay: 0.2s; }
        .loading-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }

        .search-glow:focus-within {
          box-shadow: 0 0 0 1px rgba(14,165,233,0.4), 0 0 16px rgba(14,165,233,0.12);
        }
      `}</style>

      <div className="route-map-bg -m-4 md:-m-6 p-4 md:p-6 min-h-screen" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 border border-sky-500/20">
              <Globe2 className="h-5 w-5 text-sky-400" />
            </div>
            <div>
              <h1 className="font-display text-3xl text-white tracking-wide">ROUTE MAP</h1>
              <p className="text-xs text-white/40">Select an airport to explore departing & arriving routes</p>
            </div>
          </div>
        </div>

        {/* ── Stats ───────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Airports", value: stats.totalAirports, icon: MapPin, color: "sky", delay: "0ms" },
            { label: "Routes", value: stats.totalRoutes, icon: Layers, color: "violet", delay: "80ms" },
            { label: "Busiest", value: stats.busiest, icon: TrendingUp, color: "amber", delay: "160ms" },
          ].map(({ label, value, icon: Icon, color, delay }) => (
            <div
              key={label}
              className="stat-card rounded-xl border border-white/8 bg-white/5 backdrop-blur-sm px-4 py-3"
              style={{ animationDelay: delay }}
            >
              <div className={`text-xs font-medium mb-1 text-white/40`}>{label}</div>
              <div className="flex items-center gap-2">
                <Icon className={cn(
                  "h-4 w-4",
                  color === "sky" && "text-sky-400",
                  color === "violet" && "text-violet-400",
                  color === "amber" && "text-amber-400",
                )} />
                <span className="font-display text-xl text-white">{value}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Main layout ─────────────────────────────────────────────────── */}
        <div className="flex gap-5 relative">
          
          {/* ── Airport grid ────────────────────────────────────────────── */}
          <div
            className={cn(
              "flex-1 transition-all duration-400",
              panelVisible ? "lg:mr-[420px]" : ""
            )}
          >
            {/* Search */}
            <div className="mb-4 search-glow rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden transition-all">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                <input
                  type="text"
                  placeholder="Search airports by ICAO..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value.toUpperCase())}
                  maxLength={4}
                  className="w-full bg-transparent pl-11 pr-4 py-3 text-sm text-white placeholder:text-white/25 outline-none font-mono-custom"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Loading */}
            {isLoading ? (
              <div className="flex items-center justify-center py-32 gap-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="loading-dot h-2 w-2 rounded-full bg-sky-400"
                    style={{ animationDelay: `${i * 0.2}s` }}
                  />
                ))}
              </div>
            ) : filteredAirports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 text-white/30">
                <MapPin className="h-12 w-12 mb-3 opacity-40" />
                <p>No airports match your search</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-white/30 mb-3 font-mono-custom">
                  {filteredAirports.length} airports · click to explore routes
                </p>
                <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {filteredAirports.map((airport) => {
                    const total = airport.outbound.length + airport.inbound.length;
                    const isSelected = selectedAirport?.icao === airport.icao && panelVisible;
                    return (
                      <div
                        key={airport.icao}
                        onClick={() => handleSelectAirport(airport)}
                        className={cn(
                          "airport-chip rounded-xl border border-white/10 bg-white/5 p-3",
                          isSelected && "selected"
                        )}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <span className="font-mono-custom font-bold text-base text-white">{airport.icao}</span>
                          {isSelected && (
                            <div className="h-1.5 w-1.5 rounded-full bg-sky-400 mt-1 animate-pulse" />
                          )}
                        </div>
                        <div className="flex gap-1.5">
                          <span className="flex items-center gap-0.5 text-[10px] text-sky-400/80">
                            <ArrowRight className="h-2.5 w-2.5" />
                            {airport.outbound.length}
                          </span>
                          <span className="text-[10px] text-white/20">·</span>
                          <span className="flex items-center gap-0.5 text-[10px] text-amber-400/80">
                            <ArrowLeft className="h-2.5 w-2.5" />
                            {airport.inbound.length}
                          </span>
                        </div>
                        <div className="mt-2">
                          <div className="h-0.5 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-sky-500 to-violet-500 rounded-full"
                              style={{
                                width: `${Math.min(100, (total / Math.max(...airports.map(a => a.outbound.length + a.inbound.length))) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* ── Side panel ──────────────────────────────────────────────── */}
          <div
            className={cn(
              "side-panel fixed right-0 top-0 h-screen w-full max-w-[440px] z-50 flex flex-col",
              "bg-[#060e1c]/95 backdrop-blur-xl border-l border-white/10",
              "shadow-[-24px_0_60px_rgba(0,0,0,0.5)]",
              panelVisible && "open"
            )}
          >
            {selectedAirport && panelVisible && (
              <AirportPanel
                airport={selectedAirport}
                onClose={handleClosePanel}
                onFilePirep={handleFilePirep}
              />
            )}
          </div>

          {/* Overlay for mobile */}
          {panelVisible && (
            <div
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={handleClosePanel}
            />
          )}
        </div>
      </div>
    </>
  );
}
