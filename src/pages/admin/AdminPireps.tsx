import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Shield, Search, Check, X, Pause, FileText, Plus, Briefcase, Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { StatusBadge } from "@/components/StatusBadge";
import { sendNotification } from "@/lib/notifications";

type ValidationStatus = "idle" | "validating" | "validated" | "not_validated" | "error";

type ValidationMetadata = {
  source?: string;
  matchedLogId?: string;
  confidence?: number;
  message?: string;
};

export default function AdminPireps() {
  const { isAdmin, user } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPirep, setSelectedPirep] = useState<any>(null);
  const [actionType, setActionType] = useState<"approve" | "deny" | "hold" | null>(null);
  const [reason, setReason] = useState("");
  const [newOperator, setNewOperator] = useState("");
  const [deletingOperator, setDeletingOperator] = useState<string | null>(null);
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>("idle");
  const [validationMetadata, setValidationMetadata] = useState<ValidationMetadata | null>(null);

  const clearActionDialogState = () => {
    setSelectedPirep(null);
    setActionType(null);
    setReason("");
    setValidationStatus("idle");
    setValidationMetadata(null);
  };

  const defaultOperators = [
    "Aeroflot", "Azerbaijan Airlines", "Uzbekistan Airways", "Belavia",
    "S7 Airlines", "AirBridge Cargo", "Saudia", "Emirates", "Fly Dubai",
    "Emirates SkyCargo", "Aegean Airlines", "Qatar Airways",
    "SunCountry Airlines", "IndiGo", "Oman Air", "Others",
  ];

  const { data: operators } = useQuery({
    queryKey: ["admin-operators"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("*").eq("key", "pirep_operators").maybeSingle();
      if (data?.value) {
        try { return JSON.parse(data.value) as string[]; } catch { return defaultOperators; }
      }
      return defaultOperators;
    },
  });

  const saveOperators = async (ops: string[]) => {
    const val = JSON.stringify(ops);
    const { data: existing } = await supabase.from("site_settings").select("id").eq("key", "pirep_operators").maybeSingle();
    if (existing) {
      await supabase.from("site_settings").update({ value: val, updated_at: new Date().toISOString() }).eq("key", "pirep_operators");
    } else {
      await supabase.from("site_settings").insert({ key: "pirep_operators", value: val });
    }
    queryClient.invalidateQueries({ queryKey: ["admin-operators"] });
    queryClient.invalidateQueries({ queryKey: ["pirep-operators"] });
  };

  const handleAddOperator = async () => {
    if (!newOperator.trim()) return;
    const current = operators || defaultOperators;
    if (current.includes(newOperator.trim())) { toast.error("Operator already exists"); return; }
    await saveOperators([...current, newOperator.trim()]);
    setNewOperator("");
    toast.success("Operator added");
  };

  const handleRemoveOperator = async (op: string) => {
    const current = operators || defaultOperators;
    await saveOperators(current.filter(o => o !== op));
    setDeletingOperator(null);
    toast.success("Operator removed");
  };

  const { data: pireps, isLoading } = useQuery({
    queryKey: ["admin-pireps", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("pireps")
        .select(`
          *,
          pilots (pid, full_name, ifc_username)
        `)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as "pending" | "approved" | "denied" | "on_hold");
      }

      const { data } = await query;
      return data || [];
    },
  });

  const { data: multiplierConfigs } = useQuery({
    queryKey: ["multiplier-configs-admin"],
    queryFn: async () => {
      const { data } = await supabase.from("multiplier_configs").select("*").order("value");
      return data || [];
    },
  });

  const getMultiplierName = (value: number) => {
    const config = multiplierConfigs?.find(m => Number(m.value) === Number(value));
    return config ? config.name : `×${value}`;
  };

  const getValidationBadgeVariant = (validationStatus: string | null) => {
    if (validationStatus === "validated") return "default" as const;
    if (validationStatus === "not_validated") return "secondary" as const;
    return "destructive" as const;
  };

  const getValidationLabel = (validationStatus: string | null) => {
    if (validationStatus === "validated") return "Validated";
    if (validationStatus === "not_validated") return "Not validated";
    if (validationStatus === "error") return "Validation error";
    return "Not checked";
  };

  const updatePirepMutation = useMutation({
    mutationFn: async ({
      pirepId,
      status,
      reason,
      overrideReason,
      isValidated,
    }: {
      pirepId: string;
      status: "pending" | "approved" | "denied" | "on_hold";
      reason?: string;
      overrideReason?: string;
      isValidated?: boolean;
    }) => {
      const pirep = pireps?.find((p: any) => p.id === pirepId);
      const reviewedAt = new Date().toISOString();

      if (status === "approved") {
        const isValidatedForApproval = typeof isValidated === "boolean" ? isValidated : pirep?.validation_status === "validated";
        const validationPayload: Record<string, unknown> = {
          validation_status: isValidatedForApproval ? "validated" : "not_validated",
          validation_checked_at: reviewedAt,
          validation_details: {
            source: "admin_manual_review",
            checked_at: reviewedAt,
            checked_by: user?.id || null,
            previous_validation_status: pirep?.validation_status || null,
            pirep_snapshot: {
              id: pirep?.id || pirepId,
              flight_number: pirep?.flight_number || null,
              dep_icao: pirep?.dep_icao || null,
              arr_icao: pirep?.arr_icao || null,
              flight_date: pirep?.flight_date || null,
            },
          },
        };

        if (!isValidatedForApproval) {
          validationPayload.validation_override_by = user?.id || null;
          validationPayload.validation_override_reason = overrideReason?.trim() || "Approved without validated auto-check";
        } else {
          validationPayload.validation_override_by = null;
          validationPayload.validation_override_reason = null;
        }

        const { error: validationError } = await supabase
          .from("pireps")
          .update(validationPayload)
          .eq("id", pirepId);

        if (validationError) throw validationError;
      }

      const { error } = await supabase
        .from("pireps")
        .update({
          status,
          status_reason: reason || null,
          reviewed_at: reviewedAt,
        })
        .eq("id", pirepId);

      if (error) throw error;

      if (pirep?.pilot_id && ["approved", "denied", "on_hold"].includes(status)) {
        await sendNotification({
          recipientPilotId: pirep.pilot_id,
          title: `PIREP ${status.replace("_", " ")}`,
          message: `Your PIREP ${pirep.flight_number} ${pirep.dep_icao}-${pirep.arr_icao} was ${status.replace("_", " ")}.`,
          type: "pirep_status",
          relatedEntity: "pirep",
          relatedId: pirepId,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pireps"] });
      toast.success("PIREP updated successfully");
      clearActionDialogState();
    },
    onError: (error) => {
      console.error(error);
      toast.error("Failed to update PIREP");
    },
  });

  const validatePirepMutation = useMutation({
    mutationFn: async (pirep: any) => {
      const ifcIdentifier = pirep.pilots?.ifc_username ?? null;

      if (!ifcIdentifier) {
        throw new Error(
          `Pilot "${pirep.pilots?.full_name ?? pirep.pilot_id}" has no IFC username set on their profile.`
        );
      }

      const body = {
        pirepId: pirep.id,
        pilotId: pirep.pilot_id,
        dep_icao: pirep.dep_icao,
        arr_icao: pirep.arr_icao,
        ifc_identifier: ifcIdentifier,
      };

      const { data, error } = await supabase.functions.invoke("validate-pirep-if", { body });
      if (error) throw error;
      return data;
    },
  });

  const runValidationForPirep = async (pirep: any) => {
    setValidationStatus("validating");
    setValidationMetadata(null);

    try {
      const data = await validatePirepMutation.mutateAsync(pirep);
      const isValidated = Boolean(data?.validated ?? data?.is_validated ?? data?.isValid);

      setValidationStatus(isValidated ? "validated" : "not_validated");
      setValidationMetadata({
        source: data?.source,
        matchedLogId: data?.matched_log_id ?? data?.flight_log_id,
        confidence: typeof data?.confidence === "number" ? data.confidence : undefined,
        message: data?.reason ?? data?.message,
      });

      return isValidated;
    } catch (error: any) {
      console.error(error);
      setValidationStatus("error");
      setValidationMetadata({
        message: error.message || "Validation request failed.",
      });
      return null;
    }
  };

  const handleAction = async (pirep: any, action: "approve" | "deny" | "hold") => {
    setSelectedPirep(pirep);
    setActionType(action);
    if (action === "approve") {
      await runValidationForPirep(pirep);
    }
  };

  const submitAction = async () => {
    if (!selectedPirep || !actionType) return;

    if ((actionType === "deny" || actionType === "hold") && !reason.trim()) {
      toast.error("Please provide a reason");
      return;
    }

    if (actionType === "approve") {
      const isValidated = validationStatus === "validated";
      updatePirepMutation.mutate({
        pirepId: selectedPirep.id,
        status: "approved",
        isValidated,
        overrideReason: isValidated ? undefined : (reason || validationMetadata?.message || "Manual approval"),
      });
    } else {
      updatePirepMutation.mutate({
        pirepId: selectedPirep.id,
        status: actionType === "deny" ? "denied" : "on_hold",
        reason,
      });
    }
  };

  const filteredPireps = pireps?.filter((pirep) => {
    const matchesSearch =
      searchQuery === "" ||
      String(pirep.flight_number || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      pirep.pilots?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pirep.pilots?.pid?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Manage PIREPs</h1>
          <p className="text-muted-foreground">Review and approve pilot reports</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search pilot, PID, or flight..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="denied">Denied</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Flight Reports</CardTitle>
          <CardDescription>{filteredPireps?.length || 0} PIREPs found</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2">Pilot</th>
                    <th className="text-left py-3 px-2">Date</th>
                    <th className="text-left py-3 px-2">Flight</th>
                    <th className="text-left py-3 px-2">Route</th>
                    <th className="text-left py-3 px-2">Operator</th>
                    <th className="text-left py-3 px-2">Status</th>
                    <th className="text-left py-3 px-2">Validation</th>
                    <th className="text-right py-3 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPireps?.map((pirep) => (
                    <tr key={pirep.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 px-2">
                        <p className="font-medium">{pirep.pilots?.full_name}</p>
                        <p className="text-xs text-muted-foreground">{pirep.pilots?.pid}</p>
                      </td>
                      <td className="py-3 px-2">{format(new Date(pirep.flight_date), "MMM dd, yyyy")}</td>
                      <td className="py-3 px-2 font-medium">{pirep.flight_number}</td>
                      <td className="py-3 px-2 font-mono">{pirep.dep_icao} → {pirep.arr_icao}</td>
                      <td className="py-3 px-2 text-muted-foreground">{pirep.operator}</td>
                      <td className="py-3 px-2"><StatusBadge status={pirep.status} /></td>
                      <td className="py-3 px-2">
                        <div className="space-y-1">
                          <Badge variant={getValidationBadgeVariant(pirep.validation_status)}>
                            {getValidationLabel(pirep.validation_status)}
                          </Badge>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {pirep.status !== "approved" && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => handleAction(pirep, "approve")} title="Approve">
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                          {pirep.status !== "denied" && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleAction(pirep, "deny")} title="Deny">
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                          {pirep.status !== "on_hold" && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-warning" onClick={() => handleAction(pirep, "hold")} title="Hold">
                              <Pause className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!actionType} onOpenChange={(open) => !open && clearActionDialogState()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">{actionType} PIREP</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {actionType === "approve" && (
              <div className={`p-4 rounded-lg border flex items-start gap-3 ${
                validationStatus === "validated" ? "bg-green-50 border-green-200 text-green-800" :
                validationStatus === "not_validated" ? "bg-yellow-50 border-yellow-200 text-yellow-800" :
                "bg-muted border-muted-foreground/20"
              }`}>
                {validationStatus === "validating" ? <Loader2 className="h-5 w-5 animate-spin" /> :
                 validationStatus === "validated" ? <Check className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                <div>
                  <p className="font-semibold">{getValidationLabel(validationStatus)}</p>
                  <p className="text-sm opacity-90">{validationMetadata?.message || "Auto-checking against live flight data..."}</p>
                </div>
              </div>
            )}
            {(actionType !== "approve" || validationStatus !== "validated") && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Reason / Override Note</p>
                <Textarea placeholder="Explain your decision..." value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={clearActionDialogState}>Cancel</Button>
            <Button 
              onClick={submitAction} 
              disabled={updatePirepMutation.isPending || validationStatus === "validating"}
              variant={actionType === "deny" ? "destructive" : "default"}
            >
              {updatePirepMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm {actionType}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5" /> Manage Operators</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input placeholder="New operator..." value={newOperator} onChange={(e) => setNewOperator(e.target.value)} className="max-w-sm" />
            <Button onClick={handleAddOperator}><Plus className="h-4 w-4 mr-1" /> Add</Button>
          </div>
          <Separator />
          <div className="flex flex-wrap gap-2">
            {(operators || defaultOperators).map((op) => (
              <Badge key={op} variant="secondary" className="flex items-center gap-1">
                {op}
                <X className="h-3 w-3 cursor-pointer hover:text-destructive" onClick={() => setDeletingOperator(op)} />
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!deletingOperator} onOpenChange={() => setDeletingOperator(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Operator</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to remove "{deletingOperator}"?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingOperator && handleRemoveOperator(deletingOperator)}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
