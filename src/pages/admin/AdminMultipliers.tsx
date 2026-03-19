import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Plus, Trash2, Edit, Zap, Radio } from "lucide-react";
import { toast } from "sonner";

interface MultiplierForm {
  name: string;
  value: number;
  description: string;
  is_active: boolean;
}

const emptyForm: MultiplierForm = { name: "", value: 1.0, description: "", is_active: true };

export default function AdminMultipliers() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  
  // State for Flight Multipliers
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MultiplierForm>(emptyForm);

  // State for ATC Multipliers
  const [isAtcDialogOpen, setIsAtcDialogOpen] = useState(false);
  const [editingAtcId, setEditingAtcId] = useState<string | null>(null);
  const [atcForm, setAtcForm] = useState<MultiplierForm>(emptyForm);

  // --- QUERIES ---
  const { data: multipliers, isLoading } = useQuery({
    queryKey: ["admin-multipliers"],
    queryFn: async () => {
      const { data } = await supabase.from("multiplier_configs").select("*").order("value");
      return data || [];
    },
  });

  const { data: atcMultipliers, isLoading: isLoadingAtc } = useQuery({
    queryKey: ["admin-atc-multipliers"],
    queryFn: async () => {
      const { data } = await supabase.from("atc_multiplier_configs").select("*").order("value");
      return data || [];
    },
  });

  // --- MUTATIONS (Flight) ---
  const saveMutation = useMutation({
    mutationFn: async (data: MultiplierForm & { id?: string }) => {
      const payload = { name: data.name, value: data.value, description: data.description, is_active: data.is_active };
      if (data.id) {
        const { error } = await supabase.from("multiplier_configs").update(payload).eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("multiplier_configs").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-multipliers"] });
      toast.success(editingId ? "Multiplier updated" : "Multiplier added");
      closeDialog();
    },
    onError: () => toast.error("Failed to save multiplier"),
  });

  // --- MUTATIONS (ATC) ---
  const saveAtcMutation = useMutation({
    mutationFn: async (data: MultiplierForm & { id?: string }) => {
      const payload = { name: data.name, value: data.value, description: data.description, is_active: data.is_active };
      if (data.id) {
        const { error } = await supabase.from("atc_multiplier_configs").update(payload).eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("atc_multiplier_configs").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-atc-multipliers"] });
      toast.success(editingAtcId ? "ATC Multiplier updated" : "ATC Multiplier added");
      closeAtcDialog();
    },
    onError: () => toast.error("Failed to save ATC multiplier"),
  });

  // Helpers
  const closeDialog = () => { setIsDialogOpen(false); setEditingId(null); setForm(emptyForm); };
  const closeAtcDialog = () => { setIsAtcDialogOpen(false); setEditingAtcId(null); setAtcForm(emptyForm); };

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="space-y-10 pb-10">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Admin Settings</h1>
          <p className="text-muted-foreground">Manage system-wide multipliers and configurations</p>
        </div>
      </div>

      {/* --- FLIGHT MULTIPLIERS SECTION --- */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" /> Flight Multipliers
          </h2>
          <Button onClick={() => { setEditingId(null); setForm(emptyForm); setIsDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />Add Flight Multiplier
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
             {/* ... (Reuse your existing table logic here for multipliers) ... */}
             <MultiplierTable 
               data={multipliers} 
               isLoading={isLoading} 
               onEdit={(m) => { setEditingId(m.id); setForm(m); setIsDialogOpen(true); }}
               onDelete={(id) => supabase.from("multiplier_configs").delete().eq("id", id)}
               onToggle={(id, val) => supabase.from("multiplier_configs").update({ is_active: !val }).eq("id", id)}
               queryKey="admin-multipliers"
             />
          </CardContent>
        </Card>
      </section>

      {/* --- ATC MULTIPLIERS SECTION --- */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Radio className="h-5 w-5 text-blue-500" /> ATC Multipliers
          </h2>
          <Button variant="outline" onClick={() => { setEditingAtcId(null); setAtcForm(emptyForm); setIsAtcDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />Add ATC Multiplier
          </Button>
        </div>

        <Card className="border-blue-500/20 shadow-sm">
          <CardHeader>
            <CardTitle>ATC Configuration</CardTitle>
            <CardDescription>Multipliers specifically for ATC PIREPs</CardDescription>
          </CardHeader>
          <CardContent>
            <MultiplierTable 
               data={atcMultipliers} 
               isLoading={isLoadingAtc} 
               onEdit={(m) => { setEditingAtcId(m.id); setAtcForm(m); setIsAtcDialogOpen(true); }}
               onDelete={(id) => supabase.from("atc_multiplier_configs").delete().eq("id", id)}
               onToggle={(id, val) => supabase.from("atc_multiplier_configs").update({ is_active: !val }).eq("id", id)}
               queryKey="admin-atc-multipliers"
             />
          </CardContent>
        </Card>
      </section>

      {/* DIALOGS (Simplified for brevity) */}
      <MultiplierDialog 
        open={isAtcDialogOpen} 
        setOpen={setIsAtcDialogOpen} 
        form={atcForm} 
        setForm={setAtcForm} 
        onSave={() => saveAtcMutation.mutate({ ...atcForm, id: editingAtcId || undefined })} 
        isEditing={!!editingAtcId}
      />
      
      <MultiplierDialog 
        open={isDialogOpen} 
        setOpen={setIsDialogOpen} 
        form={form} 
        setForm={setForm} 
        onSave={() => saveMutation.mutate({ ...form, id: editingId || undefined })} 
        isEditing={!!editingId}
      />
    </div>
  );
}

// Sub-component to keep the main return clean
function MultiplierTable({ data, isLoading, onEdit, onDelete, onToggle, queryKey }: any) {
  const queryClient = useQueryClient();
  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;

  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-3 px-2 font-medium">Name</th>
            <th className="text-left py-3 px-2 font-medium">Value</th>
            <th className="text-left py-3 px-2 font-medium">Active</th>
            <th className="text-right py-3 px-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {data?.map((m: any) => (
            <tr key={m.id} className="border-b last:border-0 hover:bg-muted/50">
              <td className="py-3 px-2 font-medium">{m.name}</td>
              <td className="py-3 px-2"><Badge variant="secondary">{Number(m.value).toFixed(1)}x</Badge></td>
              <td className="py-3 px-2">
                <Switch checked={m.is_active} onCheckedChange={async () => {
                  await onToggle(m.id, m.is_active);
                  queryClient.invalidateQueries({ queryKey: [queryKey] });
                }} />
              </td>
              <td className="py-3 px-2 text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onEdit(m)}><Edit className="h-4 w-4" /></Button>
                  <ConfirmDialog trigger={<Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>} onConfirm={async () => {
                    await onDelete(m.id);
                    queryClient.invalidateQueries({ queryKey: [queryKey] });
                    toast.success("Deleted");
                  }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MultiplierDialog({ open, setOpen, form, setForm, onSave, isEditing }: any) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isEditing ? "Edit" : "Add"} Multiplier</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Value</Label>
            <Input type="number" step="0.1" value={form.value} onChange={(e) => setForm({ ...form, value: parseFloat(e.target.value) })} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onSave}>{isEditing ? "Update" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
