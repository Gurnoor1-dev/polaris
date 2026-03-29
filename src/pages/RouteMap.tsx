import { useEffect, useRef, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  FileText, X, ArrowRight, ArrowLeft, ChevronLeft,
  ChevronRight, Plane, Search, MapPin, Globe2, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getPrimaryAircraft, splitRouteAircraft } from "@/lib/routeAircraft";

// ─────────────────────────────────────────────────────────────────────────────
// ICAO → [lat, lng] coordinate table
// ─────────────────────────────────────────────────────────────────────────────
const ICAO_COORDS: Record<string, [number, number]> = {
  // Russia / CIS
  UUEE: [55.972, 37.414], UUDD: [55.408, 37.906], UUWW: [55.596, 37.269],
  URWW: [48.782, 44.345], USSS: [56.743, 60.803], UNNT: [55.012, 82.650],
  URRR: [47.258, 39.818], ULLI: [59.800, 30.262], UWWW: [53.504, 50.164],
  UWKD: [55.606, 49.279], URKK: [45.034, 38.969], URMO: [43.205, 45.006],
  URMM: [43.783, 44.608], UGSS: [42.859, 41.595], UGSB: [41.600, 41.600],
  UGTB: [41.669, 44.954], UBBB: [40.467, 50.047], UTAA: [37.987, 58.361],
  UTDD: [38.543, 68.865], UTSS: [41.258, 69.281], UTSB: [39.696, 66.954],
  UTNN: [41.587, 60.642], UTFG: [40.717, 72.293], UTFO: [40.543, 72.793],
  UKON: [41.984, 71.582], UCFM: [42.847, 74.477],
  // Middle East
  OMDB: [25.253, 55.364], OMDW: [24.896, 55.173], OTHH: [25.274, 51.608],
  OERK: [24.958, 46.699], OEJN: [21.679, 39.157], OOMS: [23.594, 58.285],
  OLBA: [33.821, 35.488], LLBG: [32.011, 34.887],
  // Europe
  EGLL: [51.477, -0.461], EDDM: [48.354, 11.786], LEMD: [40.472, -3.561],
  LGAV: [37.936, 23.944], LEBL: [41.297, 2.078], LFPG: [49.009, 2.548],
  LIRF: [41.804, 12.251], EHAM: [52.310, 4.768], LSZH: [47.464, 8.549],
  LOWW: [48.110, 16.570], LKPR: [50.100, 14.260], EPWA: [52.166, 20.967],
  EVRA: [56.924, 23.971], EYVI: [54.634, 25.286], UMMS: [53.882, 28.031],
  UKBB: [50.345, 30.894], LUKK: [46.928, 28.931], LROP: [44.572, 26.102],
  LBSF: [42.697, 23.411], LWSK: [41.962, 21.621], LDZA: [45.743, 16.069],
  LYBE: [44.818, 20.309], LJLJ: [46.224, 14.458], LHBP: [47.439, 19.261],
  LZIB: [48.170, 17.213],
  // South / Southeast Asia
  VIDP: [28.556, 77.101], VABB: [19.089, 72.868], VOMM: [12.990, 80.169],
  VECC: [22.654, 88.447], VOBL: [13.199, 77.706], VOCI: [10.152, 76.400],
  VIAG: [27.157, 77.961], OPKC: [24.906, 67.161], OPLA: [31.522, 74.404],
  VCBI: [7.180, 79.886], VRMM: [4.192, 73.529],
  WMKK: [2.745, 101.710], WSSS: [1.364, 103.994], WIII: [-6.126, 106.656],
  VVTS: [10.818, 106.652], VTBS: [13.681, 100.747], RPLL: [14.509, 121.020],
  VHHH: [22.309, 113.915], ZBAA: [40.080, 116.584], ZSPD: [31.143, 121.805],
  ZGGG: [23.392, 113.299], ZGSZ: [22.639, 113.811],
  // Africa
  HECA: [30.122, 31.406], HAAB: [8.978, 38.799], DNMM: [6.577, 3.321],
  HTDA: [-6.878, 39.203], FMMI: [-18.797, 47.479], FAOR: [-26.139, 28.246],
  GMME: [34.051, -6.751], DTTA: [36.851, 10.228],
  // Americas
  KJFK: [40.640, -73.779], KLAX: [33.943, -118.408], KORD: [41.978, -87.905],
  KDFW: [32.897, -97.038], KMIA: [25.796, -80.287], KSFO: [37.619, -122.375],
  KATL: [33.636, -84.428], KBOS: [42.364, -71.005], KEWR: [40.689, -74.178],
  CYYZ: [43.677, -79.631], CYVR: [49.194, -123.184], SBGR: [-23.432, -46.469],
  MROC: [9.994, -84.209],
  // Oceania
  YSSY: [-33.947, 151.177], YMML: [-37.673, 144.843],
};

const ROUTES_PER_PAGE = 10;

const rankLabels: Record<string, string> = {
  cadet: "Cadet", first_officer: "First Officer", captain: "Captain",
  senior_captain: "Sr. Captain", commander: "Commander",
};

const formatFlightTime = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
};

// Great-circle interpolation for smooth arcs
function greatCirclePoints(
  from: [number, number],
  to: [number, number],
  n: number
): [number, number][] {
  const toR = (d: number) => (d * Math.PI) / 180;
  const toD = (r: number) => (r * 180) / Math.PI;
  const [la1, lo1] = from.map(toR);
  const [la2, lo2] = to.map(toR);
  const d = Math.acos(
    Math.min(1, Math.sin(la1) * Math.sin(la2) + Math.cos(la1) * Math.cos(la2) * Math.cos(lo2 - lo1))
  );
  if (d < 0.001) return [[from[0], from[1]], [to[0], to[1]]];
  return Array.from({ length: n + 1 }, (_, i) => {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
    const z = A * Math.sin(la1) + B * Math.sin(la2);
    return [toD(Math.atan2(z, Math.sqrt(x * x + y * y))), toD(Math.atan2(y, x))] as [number, number];
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RouteCard
// ─────────────────────────────────────────────────────────────────────────────
function RouteCard({
  route, perspective, onFilePirep, index,
}: {
  route: any; perspective: "outbound" | "inbound";
  onFilePirep: (r: any) => void; index: number;
}) {
  const isOut = perspective === "outbound";
  return (
    <div
      className="group rounded-lg border bg-card hover:bg-accent/40 transition-all duration-200 p-3"
      style={{ animationDelay: `${index * 40}ms`, animation: "rcIn 0.22s ease both" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[11px] font-bold font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
              {route.route_number}
            </span>
            <Badge variant="secondary" className="text-[10px] h-4 px-1 capitalize border-0">
              {route.route_type}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="font-mono font-bold text-base">{route.dep_icao}</span>
            <span className={isOut ? "text-blue-500" : "text-amber-500"}>
              {isOut ? <ArrowRight className="h-3.5 w-3.5" /> : <ArrowLeft className="h-3.5 w-3.5" />}
            </span>
            <span className="font-mono font-bold text-base">{route.arr_icao}</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Plane className="h-3 w-3" />
              {splitRouteAircraft(route.aircraft_icao).join(", ") || "—"}
            </span>
            <span>{formatFlightTime(route.est_flight_time_minutes)}</span>
            {route.min_rank && <span>{rankLabels[route.min_rank] || route.min_rank}</span>}
          </div>
          {route.notes && (
            <p className="mt-1 text-[11px] text-muted-foreground/60 truncate">{route.notes}</p>
          )}
        </div>
        <Button
          size="sm" variant="outline"
          onClick={() => onFilePirep(route)}
          className="shrink-0 h-7 px-2 text-[11px] hover:bg-primary hover:text-primary-foreground transition-colors"
        >
          <FileText className="h-3 w-3 mr-1" />
          PIREP
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Airport Side Panel
// ─────────────────────────────────────────────────────────────────────────────
function AirportPanel({
  icao, outbound, inbound, onClose, onFilePirep,
}: {
  icao: string; outbound: any[]; inbound: any[];
  onClose: () => void; onFilePirep: (r: any) => void;
}) {
  const [tab, setTab] = useState<"outbound" | "inbound">("outbound");
  const [outPage, setOutPage] = useState(1);
  const [inPage, setInPage] = useState(1);

  const routes = tab === "outbound" ? outbound : inbound;
  const page = tab === "outbound" ? outPage : inPage;
  const setPage = tab === "outbound" ? setOutPage : setInPage;
  const totalPages = Math.max(1, Math.ceil(routes.length / ROUTES_PER_PAGE));
  const paged = routes.slice((page - 1) * ROUTES_PER_PAGE, page * ROUTES_PER_PAGE);

  const pageNums = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    return Array.from({ length: 5 }, (_, i) => start + i);
  }, [page, totalPages]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MapPin className="h-4 w-4" />
            </div>
            <div>
              <p className="font-mono font-black text-xl tracking-wider">{icao}</p>
              <p className="text-[11px] text-muted-foreground">
                {outbound.length} departing · {inbound.length} arriving
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1 bg-muted/50 p-1 rounded-lg">
          <button
            onClick={() => setTab("outbound")}
            className={cn(
              "flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all",
              tab === "outbound"
                ? "bg-background shadow-sm text-blue-500 dark:text-blue-400"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ArrowRight className="h-3 w-3" />
            Departing ({outbound.length})
          </button>
          <button
            onClick={() => setTab("inbound")}
            className={cn(
              "flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all",
              tab === "inbound"
                ? "bg-background shadow-sm text-amber-500"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ArrowLeft className="h-3 w-3" />
            Arriving ({inbound.length})
          </button>
        </div>
      </div>

      {/* Route list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 scrollbar-thin scrollbar-thumb-border">
        {paged.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Plane className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">No routes</p>
          </div>
        ) : paged.map((route, i) => (
          <RouteCard
            key={route.id} route={route}
            perspective={tab} onFilePirep={onFilePirep} index={i}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="shrink-0 px-4 py-3 border-t flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1} className="h-7 w-7 p-0">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            {pageNums.map(p => (
              <button key={p} onClick={() => setPage(p)}
                className={cn(
                  "h-7 w-7 rounded text-xs font-medium transition-colors",
                  p === page
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent text-muted-foreground"
                )}>
                {p}
              </button>
            ))}
            <Button size="sm" variant="ghost"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages} className="h-7 w-7 p-0">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Leaflet Map
// ─────────────────────────────────────────────────────────────────────────────
function RouteMapLeaflet({
  routes, onSelectAirport, selectedIcao, flyTo,
}: {
  routes: any[];
  onSelectAirport: (icao: string) => void;
  selectedIcao: string | null;
  flyTo: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const arcLayersRef = useRef<any[]>([]);
  const leafletReadyRef = useRef(false);

  const airportMap = useMemo(() => {
    const map = new Map<string, { outbound: any[]; inbound: any[] }>();
    for (const r of routes) {
      for (const [icao, type] of [[r.dep_icao, "outbound"], [r.arr_icao, "inbound"]] as const) {
        if (!map.has(icao)) map.set(icao, { outbound: [], inbound: [] });
        map.get(icao)![type].push(r);
      }
    }
    return map;
  }, [routes]);

  const mappable = useMemo(() =>
    Array.from(airportMap.entries())
      .filter(([icao]) => ICAO_COORDS[icao])
      .map(([icao, data]) => ({ icao, coords: ICAO_COORDS[icao]!, ...data })),
    [airportMap]
  );

  const rebuildMarkers = (L: any, map: any) => {
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current.clear();

    for (const ap of mappable) {
      const total = ap.outbound.length + ap.inbound.length;
      const isSelected = ap.icao === selectedIcao;
      const r = Math.max(5, Math.min(11, 4 + Math.sqrt(total) * 1.4));

      const icon = L.divIcon({
        className: "",
        html: `<div style="
          width:${r * 2}px;height:${r * 2}px;border-radius:50%;
          background:${isSelected ? "#3b82f6" : "rgba(59,130,246,0.55)"};
          border:${isSelected ? "2.5px solid #93c5fd" : "1.5px solid rgba(147,197,253,0.6)"};
          box-shadow:${isSelected
            ? "0 0 0 4px rgba(59,130,246,0.2),0 0 14px rgba(59,130,246,0.6)"
            : "0 0 6px rgba(59,130,246,0.25)"};
          cursor:pointer;transition:transform 0.15s;
        " onmouseover="this.style.transform='scale(1.3)'" onmouseout="this.style.transform='scale(1)'"></div>`,
        iconSize: [r * 2, r * 2],
        iconAnchor: [r, r],
      });

      const marker = L.marker([ap.coords[0], ap.coords[1]], { icon, zIndexOffset: isSelected ? 1000 : 0 });
      marker.bindTooltip(
        `<span style="font-family:monospace;font-weight:700">${ap.icao}</span>
         <span style="color:#93c5fd;margin-left:8px">↗${ap.outbound.length}</span>
         <span style="color:#fcd34d;margin-left:6px">↙${ap.inbound.length}</span>`,
        { direction: "top", offset: [0, -(r + 2)], className: "rm-tooltip" }
      );
      marker.on("click", () => onSelectAirport(ap.icao));
      marker.addTo(map);
      markersRef.current.set(ap.icao, marker);
    }
  };

  const rebuildArcs = (L: any, map: any) => {
    arcLayersRef.current.forEach(l => map.removeLayer(l));
    arcLayersRef.current = [];
    if (!selectedIcao) return;

    const airport = airportMap.get(selectedIcao);
    if (!airport) return;
    const origin = ICAO_COORDS[selectedIcao];
    if (!origin) return;

    const drawn = new Set<string>();
    for (const r of [...airport.outbound, ...airport.inbound]) {
      const other = r.dep_icao === selectedIcao ? r.arr_icao : r.dep_icao;
      const key = [selectedIcao, other].sort().join("|");
      if (drawn.has(key)) continue;
      drawn.add(key);
      const dest = ICAO_COORDS[other];
      if (!dest) continue;

      const isOut = r.dep_icao === selectedIcao;
      const pts = greatCirclePoints(origin, dest, 30);
      const line = L.polyline(pts, {
        color: isOut ? "#60a5fa" : "#fbbf24",
        weight: 1.8,
        opacity: 0.7,
        dashArray: "5 4",
      });
      line.addTo(map);
      arcLayersRef.current.push(line);

      // Destination dot
      const dot = L.circleMarker([dest[0], dest[1]], {
        radius: 3,
        color: isOut ? "#60a5fa" : "#fbbf24",
        fillColor: isOut ? "#60a5fa" : "#fbbf24",
        fillOpacity: 0.8,
        weight: 1,
      });
      dot.addTo(map);
      arcLayersRef.current.push(dot);
    }
  };

  // Initialize Leaflet once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet-src.js";
    script.onload = () => {
      if (!containerRef.current || mapRef.current) return;
      const L = (window as any).L;
      const map = L.map(containerRef.current, {
        center: [35, 55], zoom: 3,
        zoomControl: false,
        attributionControl: true,
        minZoom: 2, maxZoom: 12,
      });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
        attribution: "© OSM © CARTO", maxZoom: 18,
      }).addTo(map);
      // City labels on top
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", {
        attribution: "", maxZoom: 18, pane: "overlayPane",
      }).addTo(map);

      mapRef.current = map;
      leafletReadyRef.current = true;
      rebuildMarkers(L, map);
    };
    document.head.appendChild(script);

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // Update markers + arcs when data or selection changes
  useEffect(() => {
    if (!mapRef.current || !(window as any).L || !leafletReadyRef.current) return;
    const L = (window as any).L;
    rebuildMarkers(L, mapRef.current);
    rebuildArcs(L, mapRef.current);
  }, [mappable, selectedIcao]);

  // Fly to airport
  useEffect(() => {
    if (!flyTo || !mapRef.current) return;
    const coords = ICAO_COORDS[flyTo];
    if (coords) mapRef.current.flyTo(coords, Math.max(mapRef.current.getZoom(), 5), { duration: 1.2 });
  }, [flyTo]);

  return (
    <>
      <style>{`
        .rm-tooltip {
          background: rgba(10,15,30,0.95) !important;
          border: 1px solid rgba(59,130,246,0.35) !important;
          border-radius: 6px !important;
          color: #e2e8f0 !important;
          font-size: 12px !important;
          padding: 5px 10px !important;
          box-shadow: 0 4px 16px rgba(0,0,0,0.5) !important;
          white-space: nowrap !important;
        }
        .rm-tooltip::before { display: none !important; }
        .leaflet-container { background: #0a0f1a; }
        .leaflet-control-zoom a {
          background: rgba(15,23,42,0.9) !important;
          color: #94a3b8 !important;
          border-color: rgba(148,163,184,0.2) !important;
        }
        .leaflet-control-zoom a:hover { color: #e2e8f0 !important; }
        .leaflet-control-attribution {
          background: rgba(10,15,30,0.7) !important;
          color: #475569 !important;
          font-size: 9px !important;
        }
        .leaflet-control-attribution a { color: #475569 !important; }
      `}</style>
      <div ref={containerRef} className="w-full h-full" />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function RouteMap() {
  const navigate = useNavigate();
  const [selectedIcao, setSelectedIcao] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [flyTo, setFlyTo] = useState<string | null>(null);

  const { data: routes = [], isLoading } = useQuery({
    queryKey: ["routes-map"],
    queryFn: async () => {
      const { fetchAllRows } = await import("@/lib/fetchAllRows");
      return fetchAllRows("routes", {
        filters: (q: any) => q.eq("is_active", true),
        orderColumn: "route_number",
      });
    },
  });

  const airportMap = useMemo(() => {
    const map = new Map<string, { outbound: any[]; inbound: any[] }>();
    for (const r of routes) {
      for (const [icao, type] of [[r.dep_icao, "outbound"], [r.arr_icao, "inbound"]] as const) {
        if (!map.has(icao as string)) map.set(icao as string, { outbound: [], inbound: [] });
        (map.get(icao as string)! as any)[type].push(r);
      }
    }
    return map;
  }, [routes]);

  const stats = useMemo(() => ({
    mapped: Array.from(airportMap.keys()).filter(k => ICAO_COORDS[k]).length,
    total: airportMap.size,
    routes: routes.length,
  }), [airportMap, routes]);

  const handleSelectAirport = (icao: string) => {
    setSelectedIcao(icao);
    setPanelOpen(true);
    setFlyTo(icao);
  };

  const handleClosePanel = () => {
    setPanelOpen(false);
    setSelectedIcao(null);
  };

  const handleFilePirep = (route: any) => {
    const aircraft = getPrimaryAircraft(route.aircraft_icao);
    navigate(`/file-pirep?dep=${route.dep_icao}&arr=${route.arr_icao}&aircraft=${aircraft}&flight=${route.route_number}&type=${route.route_type}`);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim().toUpperCase();
    if (!q) return;
    if (airportMap.has(q)) handleSelectAirport(q);
    else setFlyTo(q); // Just fly if it has coords
  };

  const selectedAirport = selectedIcao ? airportMap.get(selectedIcao) : null;

  return (
    <>
      <style>{`
        @keyframes rcIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:none } }
        .panel-slide { transition: transform 0.35s cubic-bezier(0.32,0.72,0,1); }
      `}</style>

      <div className="space-y-3 -mb-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Globe2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Route Map</h1>
              <p className="text-muted-foreground text-sm">
                {stats.mapped} airports mapped · {stats.routes} routes
                {stats.total > stats.mapped && ` · ${stats.total - stats.mapped} unmapped`}
              </p>
            </div>
          </div>
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="ICAO..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value.toUpperCase())}
                className="pl-9 w-28 font-mono uppercase text-sm h-9"
                maxLength={4}
              />
            </div>
            <Button type="submit" size="sm" variant="outline" className="h-9 px-3">Find</Button>
          </form>
        </div>

        {/* Legend */}
        <div className="flex gap-2 flex-wrap text-xs">
          <span className="flex items-center gap-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20 font-medium">
            <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
            Click airport · blue arcs = departing
          </span>
          <span className="flex items-center gap-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2.5 py-1 rounded-full border border-amber-500/20 font-medium">
            <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
            Amber arcs = arriving
          </span>
          <span className="flex items-center gap-1.5 bg-muted text-muted-foreground px-2.5 py-1 rounded-full border font-medium">
            Larger dot = more routes
          </span>
        </div>

        {/* Map + panel */}
        <div
          className="relative flex rounded-xl overflow-hidden border shadow-md"
          style={{ height: "calc(100vh - 210px)", minHeight: "520px" }}
        >
          {/* Map area */}
          <div className={cn("flex-1 transition-all duration-300", panelOpen ? "lg:mr-[420px]" : "")}>
            {isLoading ? (
              <div className="w-full h-full flex items-center justify-center bg-[#0a0f1a]">
                <div className="flex flex-col items-center gap-3 text-slate-400">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-sm">Loading route data...</p>
                </div>
              </div>
            ) : (
              <RouteMapLeaflet
                routes={routes}
                onSelectAirport={handleSelectAirport}
                selectedIcao={selectedIcao}
                flyTo={flyTo}
              />
            )}
          </div>

          {/* Slide-in panel */}
          <div
            className={cn(
              "panel-slide absolute right-0 top-0 h-full w-full max-w-[420px] z-20",
              "bg-background border-l flex flex-col shadow-2xl",
              panelOpen ? "translate-x-0" : "translate-x-full"
            )}
          >
            {selectedIcao && selectedAirport && panelOpen && (
              <AirportPanel
                icao={selectedIcao}
                outbound={selectedAirport.outbound}
                inbound={selectedAirport.inbound}
                onClose={handleClosePanel}
                onFilePirep={handleFilePirep}
              />
            )}
          </div>

          {/* Mobile backdrop */}
          {panelOpen && (
            <div
              className="absolute inset-0 bg-black/40 z-10 lg:hidden"
              onClick={handleClosePanel}
            />
          )}
        </div>
      </div>
    </>
  );
}
