import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Textarea } from "@/components/ui/textarea";
import { CalendarIcon, Loader2, Plane, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatPirepTime, sendDiscordEmbed } from "@/lib/discord-notify";

const DEFAULT_OPERATORS = ["Korean Air", "Others"];

export default function FilePirep() {
  const { pilot, isReady } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [flightNumber, setFlightNumber] = useState("");
  const [depIcao, setDepIcao] = useState("");
  const [arrIcao, setArrIcao] = useState("");
  const [aircraftIcao, setAircraftIcao] = useState("");
  const [selectedAircraftLabel, setSelectedAircraftLabel] = useState("");

  const [fHours, setFHours] = useState("");
  const [fMinutes, setFMinutes] = useState("");
  const [flightDate, setFlightDate] = useState<Date | undefined>(new Date());
  const [selectedMultiplier, setSelectedMultiplier] = useState("1");
  const [operator, setOperator] = useState("");
  const [otherOperatorName, setOtherOperatorName] = useState("");
  const [pax, setPax] = useState("");
  const [remarks, setRemarks] = useState("");
  const [showAllAircraft, setShowAllAircraft] = useState(false);
  const [aircraftSearch, setAircraftSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAcarsLoading, setIsAcarsLoading] = useState(false);

  useEffect(() => {
    const dep = searchParams.get("dep");
    const arr = searchParams.get("arr");
    const ac = searchParams.get("aircraft");
    const fn = searchParams.get("flight");
    if (dep) setDepIcao(dep);
    if (arr) setArrIcao(arr);
    if (ac) setAircraftIcao(ac);
    if (fn) setFlightNumber(fn);
    if (searchParams.has("event") || searchParams.has("rotw")) setShowAllAircraft(true);
  }, [searchParams]);

  const isEventOrRotw = searchParams.has("event") || searchParams.has("rotw");

  // ── Gate ALL queries on isReady so they never fire before session is set ──

  const { data: operators } = useQuery({
    queryKey: ["pirep-operators"],
    enabled: isReady,
    queryFn: async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "pirep_operators")
        .maybeSingle();
      if (data?.value) {
        try {
          const list = JSON.parse(data.value) as string[];
          return list.includes("Others") ? list : [...list, "Others"];
        } catch {
          return DEFAULT_OPERATORS;
        }
      }
      return DEFAULT_OPERATORS;
    },
  });

  const { data: aircraft, isLoading: aircraftLoading } = useQuery({
    queryKey: ["aircraft"],
    enabled: isReady,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("aircraft")
        .select("id,icao_code,name,livery")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: rankConfigs } = useQuery({
    queryKey: ["rank-configs-all"],
    enabled: isReady,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rank_configs")
        .select("*")
        .eq("is_active", true)
        .order("order_index");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: multipliers, isLoading: multipliersLoading } = useQuery({
    queryKey: ["multiplier-configs"],
    enabled: isReady,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("multiplier_configs")
        .select("*")
        .eq("is_active", true)
        .order("value");
      if (error) throw error;
      return data || [];
    },
  });

  // Seed the multiplier select once multipliers are loaded
  useEffect(() => {
    if (multipliers && multipliers.length > 0 && selectedMultiplier === "1") {
      const standard = multipliers.find(
        (m) => m.value === 1 || String(m.value) === "1"
      );
      if (standard) setSelectedMultiplier(String(standard.value));
    }
  }, [multipliers]);

  const unlockedAircraftIcaos = useMemo(() => {
    if (!rankConfigs || !pilot?.current_rank) return null;
    const pilotRank = rankConfigs.find((r) => r.name === pilot.current_rank);
    if (!pilotRank) return null;
    const unlocked = new Set<string>();
    for (const rank of rankConfigs) {
      if (rank.order_index <= pilotRank.order_index) {
        const ac = (rank as any).aircraft_unlocks;
        if (Array.isArray(ac))
          ac.forEach((i: string) => unlocked.add(String(i).trim().toUpperCase()));
      }
    }
    return unlocked.size > 0 ? Array.from(unlocked) : null;
  }, [rankConfigs, pilot?.current_rank]);

  const availableAircraft = useMemo(() => {
    if (!aircraft) return [];
    let list = aircraft;
    if (!isEventOrRotw && !showAllAircraft && unlockedAircraftIcaos) {
      list = aircraft.filter((ac) =>
        unlockedAircraftIcaos.includes(String(ac.icao_code || "").toUpperCase())
      );
    }
    if (aircraftSearch.trim()) {
      const search = aircraftSearch.toLowerCase();
      list = list.filter(
        (ac) =>
          String(ac.icao_code || "").toLowerCase().includes(search) ||
          String(ac.name || "").toLowerCase().includes(search) ||
          String(ac.livery || "").toLowerCase().includes(search)
      );
    }
    return list;
  }, [aircraft, isEventOrRotw, showAllAircraft, unlockedAircraftIcaos, aircraftSearch]);

  const aircraftLabelMap = useMemo(() => {
    if (!aircraft) return {} as Record<string, string>;
    return aircraft.reduce((acc, ac) => {
      const key = String(ac.icao_code || "").toUpperCase();
      if (key && !acc[key]) acc[key] = ac.name || key;
      return acc;
    }, {} as Record<string, string>);
  }, [aircraft]);

  const currentMultiplierValue = parseFloat(selectedMultiplier) || 1;

  const handleLoadAcars = async () => {
    if (!pilot?.ifc_username) {
      toast.error("Set your IFC username in Profile Settings first.");
      return;
    }
    setIsAcarsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("validate-pirep-if", {
        body: { ifc_identifier: pilot.ifc_username, latest_only: true },
      });
      if (error) throw error;
      const latestFlight = data?.latestFlight;
      if (!latestFlight) {
        toast.error("No recent Infinite Flight log found.");
        return;
      }
      if (latestFlight.callsign)
        setFlightNumber(String(latestFlight.callsign).toUpperCase());
      if (latestFlight.originAirport)
        setDepIcao(String(latestFlight.originAirport).toUpperCase());
      if (latestFlight.destinationAirport)
        setArrIcao(String(latestFlight.destinationAirport).toUpperCase());
      if (latestFlight.created) setFlightDate(new Date(latestFlight.created));
      if (typeof latestFlight.totalTime === "number") {
        const hoursTotal =
          latestFlight.totalTime > 24
            ? latestFlight.totalTime / 3600
            : latestFlight.totalTime;
        const h = Math.floor(hoursTotal);
        const m = Math.round((hoursTotal - h) * 60);
        setFHours(String(h));
        setFMinutes(String(m));
      }
      toast.success("ACARS loaded from your latest flight log.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to load ACARS data");
    } finally {
      setIsAcarsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalOperator = operator === "Others" ? otherOperatorName : operator;
    const hoursNum = parseFloat(fHours) || 0;
    const minsNum = parseFloat(fMinutes) || 0;
    const totalDecimalHours = hoursNum + minsNum / 60;

    if (!pilot?.id) {
      toast.error("Pilot profile not found");
      return;
    }
    if (!flightNumber || !depIcao || !arrIcao || !aircraftIcao || !flightDate || !finalOperator) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (totalDecimalHours <= 0 || totalDecimalHours > 24) {
      toast.error("Please enter valid flight time (0-24h)");
      return;
    }

    const paxValue = pax.trim() === "" ? null : Number(pax);

    setIsLoading(true);
    try {
      const { error } = await supabase.from("pireps").insert({
        pilot_id: pilot.id,
        flight_number: flightNumber.toUpperCase(),
        dep_icao: depIcao.toUpperCase(),
        arr_icao: arrIcao.toUpperCase(),
        aircraft_icao: aircraftIcao,
        flight_hours: totalDecimalHours,
        flight_date: format(flightDate, "yyyy-MM-dd"),
        multiplier: currentMultiplierValue,
        operator: finalOperator,
        flight_type: "passenger",
        pax: paxValue,
        // Note: removed remarks_new — not in schema. Add status_reason or a
        // real remarks column if you need to store free-text remarks.
      });

      if (error) throw error;

      // Discord Notification
      const totalHoursWithMulti = totalDecimalHours * currentMultiplierValue;

      await sendDiscordEmbed({
        title: "🛫 New PIREP Submitted",
        color: 3447003,
        description: `\n🛫 **Flight:** ${flightNumber.toUpperCase()}\n\n🛣️ **Route:** ${depIcao.toUpperCase()} → ${arrIcao.toUpperCase()}\n\n👨‍✈️ **Pilot:** ${pilot.full_name} (${pilot.pid}*)\n\n✈️ **Aircraft:** ${aircraftIcao}\n\n⏱️ **Flight Time:** ${formatPirepTime(totalHoursWithMulti)}\n\n👥 **Passengers:** ${paxValue || 0}\n\n📝 **Remarks:** ${remarks || "None"}\n\n📅 **Submitted:** ${format(new Date(), "dd-MM-yyyy HH:mm")}\n\n[View PIREP](https://www.crewcenterkeva.com/admin/pireps)`,
      });

      toast.success("PIREP submitted successfully!");
      navigate("/pirep-history");
    } catch (err) {
      console.error(err);
      toast.error("Failed to submit PIREP");
    } finally {
      setIsLoading(false);
    }
  };

  const triggerLabel = aircraftIcao
    ? `${aircraftLabelMap[aircraftIcao] || aircraftIcao} (${aircraftIcao})`
    : selectedAircraftLabel || "Select aircraft";

  // Show a loading state while auth or data is settling
  if (!isReady) {
    return (
      <div className="max-w-2xl mx-auto pb-10 flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-10">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Plane className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>File PIREP</CardTitle>
                <CardDescription>Submit a new pilot report</CardDescription>
              </div>
            </div>
            {!isEventOrRotw && (
              <div className="flex items-center space-x-2 bg-muted/50 p-2 rounded-lg">
                <Checkbox
                  id="rotw-fr-e"
                  checked={showAllAircraft}
                  onCheckedChange={(checked) => {
                    setShowAllAircraft(Boolean(checked));
                    setAircraftSearch("");
                  }}
                  disabled={isLoading}
                />
                <Label htmlFor="rotw-fr-e" className="text-xs font-bold cursor-pointer">
                  ROTW/FR/E
                </Label>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <Button
              type="button"
              variant="outline"
              onClick={handleLoadAcars}
              disabled={isLoading || isAcarsLoading}
              className="w-full md:w-auto"
            >
              {isAcarsLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              ACARS
            </Button>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Flight Details</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="flightNumber">Flight Number *</Label>
                  <Input
                    id="flightNumber"
                    placeholder="AFL1234"
                    value={flightNumber}
                    onChange={(e) => setFlightNumber(e.target.value)}
                    disabled={isLoading}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="flightDate">Flight Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !flightDate && "text-muted-foreground"
                        )}
                        disabled={isLoading}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {flightDate ? format(flightDate, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={flightDate}
                        onSelect={setFlightDate}
                        disabled={(date) => date > new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="depIcao">Departure ICAO *</Label>
                  <Input
                    id="depIcao"
                    placeholder="UUEE"
                    maxLength={4}
                    value={depIcao}
                    onChange={(e) => setDepIcao(e.target.value.toUpperCase())}
                    disabled={isLoading}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="arrIcao">Arrival ICAO *</Label>
                  <Input
                    id="arrIcao"
                    placeholder="EGLL"
                    maxLength={4}
                    value={arrIcao}
                    onChange={(e) => setArrIcao(e.target.value.toUpperCase())}
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Aircraft & Duration</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="aircraft">Aircraft Type *</Label>
                  {aircraftLoading ? (
                    <div className="flex items-center gap-2 h-10 px-3 border rounded-md bg-muted/30">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Loading aircraft…</span>
                    </div>
                  ) : (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between"
                        >
                          {triggerLabel}
                          <Plane className="ml-2 h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0">
                        <Command>
                          <CommandInput
                            placeholder="Search aircraft..."
                            value={aircraftSearch}
                            onValueChange={setAircraftSearch}
                          />
                          <CommandList>
                            <CommandEmpty>No aircraft found.</CommandEmpty>
                            <CommandGroup>
                              {availableAircraft.map((ac) => {
                                const icao = String(ac.icao_code).toUpperCase();
                                const label = ac.livery
                                  ? `${ac.name} (${icao}) - ${ac.livery}`
                                  : `${ac.name} (${icao})`;
                                return (
                                  <CommandItem
                                    key={ac.id}
                                    value={`${ac.name} ${icao} ${ac.livery || ""}`}
                                    onSelect={() => {
                                      setAircraftIcao(icao);
                                      setSelectedAircraftLabel(label);
                                      setAircraftSearch("");
                                    }}
                                  >
                                    <Plane className="mr-2 h-4 w-4" />
                                    {label}
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Flight Time *</Label>
                  <div className="flex gap-2">
                    <Input
                      className="flex-1"
                      type="number"
                      placeholder="Hrs"
                      min="0"
                      max="23"
                      value={fHours}
                      onChange={(e) => setFHours(e.target.value)}
                      disabled={isLoading}
                      required
                    />
                    <Input
                      className="flex-1"
                      type="number"
                      placeholder="Mins"
                      min="0"
                      max="59"
                      value={fMinutes}
                      onChange={(e) => setFMinutes(e.target.value)}
                      disabled={isLoading}
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Operator & Details</h3>

              <div className="space-y-3">
                <Label>Operator *</Label>
                <Select value={operator} onValueChange={setOperator} disabled={isLoading}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select operator" />
                  </SelectTrigger>
                  <SelectContent>
                    {(operators || DEFAULT_OPERATORS).map((op) => (
                      <SelectItem key={op} value={op}>
                        {op}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {operator === "Others" && (
                  <div className="animate-in slide-in-from-top-2 duration-300">
                    <Input
                      placeholder="Enter Operator Name"
                      value={otherOperatorName}
                      onChange={(e) => setOtherOperatorName(e.target.value)}
                      required
                    />
                  </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="multiplier">Hours Multiplier</Label>
                  {multipliersLoading ? (
                    <div className="flex items-center gap-2 h-10 px-3 border rounded-md bg-muted/30">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Loading…</span>
                    </div>
                  ) : (
                    <Select
                      value={selectedMultiplier}
                      onValueChange={setSelectedMultiplier}
                      disabled={isLoading}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {multipliers && multipliers.length > 0 ? (
                          multipliers.map((m) => (
                            <SelectItem key={m.id} value={String(m.value)}>
                              {m.name} ({Number(m.value).toFixed(1)}x)
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="1">Standard (1.0x)</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pax">Passengers</Label>
                  <Input
                    id="pax"
                    type="number"
                    placeholder="180"
                    value={pax}
                    onChange={(e) => setPax(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="remarks" className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" /> Remarks
                </Label>
                <Textarea
                  id="remarks"
                  placeholder="Any notes about the flight..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  disabled={isLoading}
                  className="resize-none"
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-lg font-semibold"
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />} Submit PIREP
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
