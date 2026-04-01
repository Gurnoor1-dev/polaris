import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, FileText, Award, Hash, Flame, Plus, Trophy, Plane } from "lucide-react";
import { Link } from "react-router-dom";
import { isSameDay, format, subDays } from "date-fns";
import aeroflotBanner from "@/assets/aeroflot-banner1.png";
import { TodayROTW } from "@/components/dashboard/TodayROTW";
import { UpcomingEvents } from "@/components/dashboard/UpcomingEvents";
import { NotamCard } from "@/components/dashboard/NotamCard";
import { Announcements } from "@/components/dashboard/Announcements";
import { DailyFeaturedRoutes } from "@/components/dashboard/DailyFeaturedRoutes";

export default function Dashboard() {
  const { pilot } = useAuth();

  const { data: settings } = useQuery({
    queryKey: ["site-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("*");
      return data || [];
    },
  });

  const heroImageUrl = settings?.find((s: any) => s.key === "dashboard_hero_url")?.value;

  const { data: ranks } = useQuery({
    queryKey: ["rank-configs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("rank_configs")
        .select("*")
        .eq("is_active", true)
        .order("order_index");
      return data || [];
    },
  });

  const { data: recentPireps, isLoading: pirepsLoading } = useQuery({
    queryKey: ["recent-pireps", pilot?.id],
    queryFn: async () => {
      if (!pilot?.id) return [];
      const { data } = await supabase
        .from("pireps")
        .select("*")
        .eq("pilot_id", pilot.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!pilot?.id,
  });

  // Approved PIREPs from the last 7 days — used for the calendar strip.
  // Separate from recentPireps so the strip only lights up on approved days.
  const { data: weekPireps } = useQuery({
    queryKey: ["week-approved-pireps", pilot?.id],
    queryFn: async () => {
      if (!pilot?.id) return [];
      const sevenDaysAgo = format(subDays(new Date(), 6), "yyyy-MM-dd");
      const { data } = await supabase
        .from("pireps")
        .select("flight_date")
        .eq("pilot_id", pilot.id)
        .eq("status", "approved")
        .gte("flight_date", sevenDaysAgo);
      return data || [];
    },
    enabled: !!pilot?.id,
  });

  // Read the pre-calculated streak cache (refreshed by DB trigger on approval)
  const { data: streak } = useQuery({
    queryKey: ["pilot-streak", pilot?.id],
    queryFn: async () => {
      if (!pilot?.id) return null;
      const { data } = await supabase
        .from("pilot_streaks")
        .select("*")
        .eq("pilot_id", pilot.id)
        .maybeSingle();
      return data;
    },
    enabled: !!pilot?.id,
  });

  const formatFlightTime = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  const getRankLabel = (rankName: string) => {
    const rank = ranks?.find((r) => r.name === rankName);
    return rank?.label || rankName.replace(/_/g, " ");
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      pending: "status-pending",
      approved: "status-approved",
      denied: "status-denied",
      on_hold: "status-on-hold",
    };
    return (
      <Badge variant="outline" className={variants[status] || ""}>
        {status.replace("_", " ").toUpperCase()}
      </Badge>
    );
  };

  // Build 7-day strip. Approved dates come from weekPireps so pending/denied
  // PIREPs never light up a square.
  const getWeekDays = () => {
    const today = new Date();
    const approvedDates = (weekPireps || []).map((p) => new Date(p.flight_date));
    return Array.from({ length: 7 }, (_, i) => {
      const date = subDays(today, 6 - i);
      return {
        name: format(date, "EEE"),
        date: date.getDate(),
        isToday: i === 6,
        hasPirep: approvedDates.some((d) => isSameDay(d, date)),
      };
    });
  };

  const weekDays = getWeekDays();
  const currentStreak = streak?.current_streak ?? 0;
  const longestStreak = streak?.longest_streak ?? 0;
  const todayHasPirep = weekDays[6]?.hasPirep ?? false;

  // Flame colour scales with streak length
  const flameColor =
    currentStreak >= 7
      ? "text-orange-500"
      : currentStreak >= 3
      ? "text-amber-500"
      : currentStreak >= 1
      ? "text-yellow-500"
      : "text-muted-foreground";

  if (!pilot) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full rounded-xl" />
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Hero Banner ──────────────────────────────────────────────────────── */}
      <div className="relative h-48 rounded-xl overflow-hidden">
        <img
          src={heroImageUrl || aeroflotBanner}
          alt="Aircraft"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background/60 via-background/30 to-transparent" />
        <div className="relative z-10 h-full flex items-end p-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">
              Welcome back, {pilot.full_name.split(" ")[0]}!
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {todayHasPirep
                ? "Great flying today — streak is safe! ✈️"
                : currentStreak > 0
                ? `${currentStreak}-day streak active — fly today to keep it going!`
                : "Ready for your next flight?"}
            </p>
          </div>
        </div>
      </div>

      <Announcements />
      <NotamCard />
      <DailyFeaturedRoutes />
      <TodayROTW />

      {/* ── Stats Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Callsign</p>
                <p className="text-2xl font-bold mt-1">{pilot.pid}</p>
              </div>
              <Hash className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Rank</p>
                <p className="text-2xl font-bold mt-1 capitalize">
                  {getRankLabel(pilot.current_rank)}
                </p>
              </div>
              <Award className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total PIREPs</p>
                <p className="text-2xl font-bold mt-1">{pilot.total_pireps}</p>
              </div>
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Flight Time</p>
                <p className="text-2xl font-bold mt-1">{formatFlightTime(pilot.total_hours)}</p>
              </div>
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Streak + Events Row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Streak Card */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Flying Streak</CardTitle>
              {/* Nudge button — only shown when streak is active but today is empty */}
              {!todayHasPirep && currentStreak > 0 && (
                <Link to="/file-pirep">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                  >
                    <Plane className="h-3 w-3 mr-1" />
                    Fly today
                  </Button>
                </Link>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">

            {/* Current + Longest counters */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                <Flame className={`h-8 w-8 shrink-0 ${flameColor}`} />
                <div>
                  <p className="text-2xl font-bold leading-none">{currentStreak}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {currentStreak === 1 ? "day" : "days"} current
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                <Trophy className="h-8 w-8 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold leading-none">{longestStreak}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {longestStreak === 1 ? "day" : "days"} best
                  </p>
                </div>
              </div>
            </div>

            {/* 7-day calendar strip */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Last 7 days (approved PIREPs)</p>
              <div className="flex gap-1.5">
                {weekDays.map((day, index) => (
                  <div key={index} className="flex-1 text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">{day.name}</p>
                    <div
                      className={`
                        h-9 rounded flex items-center justify-center text-xs font-semibold transition-colors
                        ${day.hasPirep
                          ? "bg-primary text-primary-foreground"
                          : day.isToday
                          ? "bg-accent text-accent-foreground ring-1 ring-primary/40"
                          : "bg-muted text-muted-foreground"
                        }
                      `}
                    >
                      {day.hasPirep ? "✓" : day.date}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Contextual footer message */}
            <p className="text-xs text-muted-foreground">
              {todayHasPirep
                ? "You've already flown today — streak secured!"
                : currentStreak > 0
                ? "File a PIREP before midnight to keep your streak alive."
                : "Start a new streak by filing a PIREP today."}
            </p>

          </CardContent>
        </Card>

        <UpcomingEvents />
      </div>

      {/* ── New PIREP CTA ────────────────────────────────────────────────────── */}
      <Link to="/file-pirep">
        <Button
          variant="outline"
          className="w-full border-primary/20 text-primary hover:bg-primary/10"
        >
          <Plus className="h-4 w-4 mr-2" />
          New PIREP +
        </Button>
      </Link>

      {/* ── Latest 5 PIREPs ──────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Latest 5 PIREPs</h2>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted text-left">
                    <th className="px-4 py-3 font-medium text-muted-foreground">Flight Number</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Departure</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Arrival</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pirepsLoading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                        Loading...
                      </td>
                    </tr>
                  ) : recentPireps && recentPireps.length > 0 ? (
                    recentPireps.map((pirep) => (
                      <tr key={pirep.id} className="border-t border-border">
                        <td className="px-4 py-3">{pirep.flight_number}</td>
                        <td className="px-4 py-3">{pirep.dep_icao}</td>
                        <td className="px-4 py-3">{pirep.arr_icao}</td>
                        <td className="px-4 py-3">{getStatusBadge(pirep.status)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                        No PIREPs filed yet. File your first PIREP to get started!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
