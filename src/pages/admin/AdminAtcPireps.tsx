import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Radio, Search, Check, X, Pause, Clock, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/StatusBadge";

const FREQ_MAP: Record<string, string> = {
  G: "Ground",
  T: "Tower",
  S: "ATIS",
  A: "Approach",
  D: "Departure",
  C: "Center",
};

const PAGE_SIZE = 15;

const calculateDuration = (open: string, close: string): number => {
  if (!open || !close) return 0;
  try {
    const [startH, startM] = open.split(":").map(Number);
    const [endH, endM] = close.split(":").map(Number);
    let startTotal = startH * 60 + startM;
    let endTotal = endH * 60 + endM;
    if (endTotal < startTotal) endTotal += 24 * 60;
    return (endTotal - startTotal) / 60;
  } catch {
    return 0;
  }
};

const formatHours = (hours: number) => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export default function AdminAtcPireps() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  const [selectedPirep, setSelectedPirep] = useState<any>(null);
  const [actionType, setActionType] = useState<"approve" | "deny" | "hold" | null>(null);
  const [reason, setReason] = useState("");

  const clearDialog = () => {
    setSelectedPirep(null);
    setActionType(null);
    setReason("");
  };

  const { data, isLoading } = useQuery({
    queryKey: ["atc_admin_queue", statusFilter],
    queryFn: async () => {
      // 1. Fetch ATC PIREPs
      let query = supabase
        .from("atc_pireps")
        .select("*")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data: pireps, error } = await query;
      if (error) throw error;
      if (!pireps?.length) return [];

      // 2. Fetch ALL pilots (user_id + id both, for dual-matching)
      const { data: pilots, error: pErr } = await supabase
        .from("pilots")
        .select("id, user_id, full_name, pid");

      if (pErr) console.error("Pilot fetch error:", pErr);

      const pilotList = pilots ?? [];

      // 3. Merge — try user_id match first, fall back to nothing (don't guess)
      return pireps.map((p) => {
        const pilot =
          pilotList.find((pl) => pl.user_id && pl.user_id === p.user_id) ??
          null;

        return { ...p, pilot };
      });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({
      pirep,
      newStatus,
      reason,
    }: {
      pirep: any;
      newStatus: string;
      reason?: string;
    }) => {
      const oldStatus = pirep.status;
      const rawHours =
        calculateDuration(pirep.freq_open_time, pirep.freq_close_time) *
        (Number(pirep.multiplier) || 1);

      // ── Step 1: Update atc_pireps status ───────────────────────────────
      // Only send columns that definitely exist on the table.
      // Avoid sending status_reason / reviewed_at if your table doesn't have them —
      // Supabase will return a 400 and silently swallow it unless we check the error.
      const updatePayload: Record<string, any> = { status: newStatus };
      if (reason?.trim()) updatePayload.remarks = reason.trim(); // use remarks col if no status_reason

      const { error: updateError } = await supabase
        .from("atc_pireps")
        .update(updatePayload)
        .eq("id", pirep.id);

      if (updateError) {
        console.error("ATC PIREP update error:", updateError);
        throw new Error(updateError.message || "Failed to update ATC PIREP status");
      }

      // ── Step 2: Sync pilot total_hours / total_pireps ─────────────────
      if (!pirep.user_id) return; // can't update pilot hours without user_id

      const { data: pilot, error: pilotFetchError } = await supabase
        .from("pilots")
        .select("id, total_hours, total_pireps")
        .eq("user_id", pirep.user_id)
        .maybeSingle(); // use maybeSingle so we don't throw if not found

      if (pilotFetchError) {
        console.error("Pilot fetch error during hour sync:", pilotFetchError);
        // Don't throw — status was already updated, hours sync is secondary
        return;
      }

      if (!pilot) {
        console.warn("No pilot row found for user_id:", pirep.user_id);
        return;
      }

      let h = Number(pilot.total_hours) || 0;
      let p = Number(pilot.total_pireps) || 0;

      if (newStatus === "approved" && oldStatus !== "approved") {
        h += rawHours;
        p += 1;
      } else if (oldStatus === "approved" && newStatus !== "approved") {
        h = Math.max(0, h - rawHours);
        p = Math.max(0, p - 1);
      } else {
        // No hours change needed (e.g. pending → rejected, both non-approved)
        return;
      }

      const { error: pilotUpdateError } = await supabase
        .from("pilots")
        .update({
          total_hours: parseFloat(h.toFixed(2)),
          total_pireps: p,
        })
        .eq("id", pilot.id); // use primary key `id`, not user_id, for the update

      if (pilotUpdateError) {
        console.error("Pilot hours update error:", pilotUpdateError);
        // Status already updated — just warn
        toast.warning("Status updated but pilot hours sync failed. Check console.");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["atc_admin_queue"] });
      toast.success("ATC PIREP updated successfully");
      clearDialog();
    },
    onError: (err: any) => {
      console.error("Mutation error:", err);
      toast.error(err?.message || "Failed to update ATC PIREP");
    },
  });

  const handleAction = (pirep: any, action: "approve" | "deny" | "hold") => {
    setSelectedPirep(pirep);
    setActionType(action);
  };

  const submitAction = () => {
    if (!selectedPirep || !actionType) return;
    if ((actionType === "deny") && !reason.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }

    const newStatus =
      actionType === "approve" ? "approved" :
      actionType === "deny"    ? "rejected" :
                                 "pending";  // hold = reset to pending

    updateStatus.mutate({
      pirep: selectedPirep,
      newStatus,
      reason: reason.trim() || undefined,
    });
  };

  // Filter + paginate
  const filtered = (data ?? []).filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.airport_icao?.toLowerCase().includes(q) ||
      item.pilot?.full_name?.toLowerCase().includes(q) ||
      item.pilot?.pid?.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Radio className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">ATC PIREPs</h1>
          <p className="text-muted-foreground">Review and approve ATC session reports</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search pilot, PID, or airport..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => { setStatusFilter(v); setPage(1); }}
            >
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>ATC Session Reports</CardTitle>
          <CardDescription>
            {filtered.length} report{filtered.length !== 1 ? "s" : ""} found • Page {safePage} of {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : paged.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Radio className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p>No ATC PIREPs found</p>
              <p className="text-sm">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium">Pilot</th>
                    <th className="text-left py-3 px-2 font-medium">Date</th>
                    <th className="text-left py-3 px-2 font-medium">Airport</th>
                    <th className="text-left py-3 px-2 font-medium">Shift (Z)</th>
                    <th className="text-left py-3 px-2 font-medium">Duration</th>
                    <th className="text-left py-3 px-2 font-medium">Stations</th>
                    <th className="text-left py-3 px-2 font-medium">Multiplier</th>
                    <th className="text-left py-3 px-2 font-medium">Status</th>
                    <th className="text-right py-3 px-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((item) => {
                    const rawHours = calculateDuration(item.freq_open_time, item.freq_close_time);
                    const totalHours = rawHours * (item.multiplier || 1);
                    const freqs: string[] = Array.isArray(item.selected_frequencies)
                      ? item.selected_frequencies : [];

                    return (
                      <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50">
                        {/* Pilot */}
                        <td className="py-3 px-2">
                          {item.pilot ? (
                            <>
                              <p className="font-medium">{item.pilot.full_name}</p>
                              <p className="text-xs text-muted-foreground">{item.pilot.pid}</p>
                            </>
                          ) : (
                            <>
                              <p className="text-muted-foreground italic text-xs">Not linked</p>
                              <p className="text-xs text-muted-foreground font-mono">
                                {item.user_id?.slice(0, 12)}…
                              </p>
                            </>
                          )}
                        </td>

                        {/* Date */}
                        <td className="py-3 px-2 text-muted-foreground">{item.date ?? "—"}</td>

                        {/* Airport */}
                        <td className="py-3 px-2 font-mono font-semibold">{item.airport_icao}</td>

                        {/* Shift */}
                        <td className="py-3 px-2 font-mono text-xs text-muted-foreground">
                          {item.freq_open_time} – {item.freq_close_time}
                        </td>

                        {/* Duration */}
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-1.5 font-mono text-xs">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{formatHours(totalHours)}</span>
                          </div>
                        </td>

                        {/* Stations */}
                        <td className="py-3 px-2">
                          <div className="flex flex-wrap gap-1">
                            {freqs.length > 0 ? (
                              freqs.map((code) => (
                                <Badge
                                  key={code}
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0 font-mono"
                                  title={FREQ_MAP[code] ?? code}
                                >
                                  {code}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </div>
                        </td>

                        {/* Multiplier */}
                        <td className="py-3 px-2">
                          {item.multiplier && Number(item.multiplier) !== 1 ? (
                            <Badge variant="outline" className="text-[10px] px-1.5">×{item.multiplier}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">×1</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-2">
                          <StatusBadge status={item.status} />
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {item.status !== "approved" && (
                              <Button
                                size="icon" variant="ghost"
                                className="h-8 w-8 text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                                onClick={() => handleAction(item, "approve")}
                                title="Approve"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              size="icon" variant="ghost"
                              className="h-8 w-8 text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-950"
                              onClick={() => handleAction(item, "hold")}
                              title="Reset to Pending"
                            >
                              <Pause className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon" variant="ghost"
                              className="h-8 w-8 text-destructive hover:bg-red-50 dark:hover:bg-red-950"
                              onClick={() => handleAction(item, "deny")}
                              title="Reject"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium">{safePage} / {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action dialog */}
      <Dialog open={!!actionType} onOpenChange={(open) => !open && clearDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">{actionType} ATC PIREP</DialogTitle>
          </DialogHeader>

          {selectedPirep && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pilot</span>
                  <span className="font-medium">
                    {selectedPirep.pilot?.full_name ?? (
                      <span className="italic text-muted-foreground">Not linked</span>
                    )}
                    {selectedPirep.pilot?.pid && (
                      <span className="text-muted-foreground text-xs ml-1">
                        ({selectedPirep.pilot.pid})
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Airport</span>
                  <span className="font-mono font-semibold">{selectedPirep.airport_icao}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shift</span>
                  <span className="font-mono text-xs">
                    {selectedPirep.freq_open_time} – {selectedPirep.freq_close_time} Z
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stations</span>
                  <div className="flex gap-1">
                    {(Array.isArray(selectedPirep.selected_frequencies)
                      ? selectedPirep.selected_frequencies : []
                    ).map((code: string) => (
                      <Badge key={code} variant="secondary" className="text-[10px] px-1.5 py-0" title={FREQ_MAP[code]}>
                        {code}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Hours</span>
                  <span className="font-mono font-semibold">
                    {formatHours(
                      calculateDuration(selectedPirep.freq_open_time, selectedPirep.freq_close_time) *
                      (selectedPirep.multiplier || 1)
                    )}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {actionType === "approve" ? "Note (optional)" : "Reason *"}
                </p>
                <Textarea
                  placeholder={actionType === "approve" ? "Any notes..." : "Explain your decision..."}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={clearDialog}>Cancel</Button>
            <Button
              onClick={submitAction}
              disabled={updateStatus.isPending}
              variant={actionType === "deny" ? "destructive" : "default"}
            >
              {updateStatus.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm {actionType}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
