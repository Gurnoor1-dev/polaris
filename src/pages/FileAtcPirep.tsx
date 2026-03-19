import { useState } from "react"
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Radio, Loader2, Info, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { sendDiscordEmbed } from "@/lib/discord-notify"
import { cn } from "@/lib/utils"

// Import the multipliers from the root JSON file
import multiplierData from "../../../atc-multipliers.json"

export default function FileAtcPirep() {
  const { user, pilot } = useAuth()
  const [date, setDate] = useState("")
  const [icao, setIcao] = useState("")
  const [open, setOpen] = useState("")
  const [close, setClose] = useState("")
  const [multiplier, setMultiplier] = useState("1")
  const [remarks, setRemarks] = useState("")
  const [loading, setLoading] = useState(false)

  // Frequency State
  const [selectedFreqs, setSelectedFreqs] = useState<string[]>([])
  const [isSupervisor, setIsSupervisor] = useState(false)

  const freqOptions = [
    { id: "ATIS", label: "ATIS (S)" },
    { id: "Tower", label: "Tower (T)" },
    { id: "Ground", label: "Ground (G)" },
    { id: "Approach", label: "Approach (A)" },
    { id: "Departure", label: "Departure (D)" },
    { id: "Center", label: "Center (C)" }
  ]

  const toggleFreq = (id: string) => {
    if (selectedFreqs.includes(id)) {
      setSelectedFreqs(selectedFreqs.filter(f => f !== id))
    } else {
      setSelectedFreqs([...selectedFreqs, id])
    }
  }

  const hasInvalidCombo = () => {
    if (isSupervisor) return false
    const hasCenter = selectedFreqs.includes("Center")
    const hasRadar = selectedFreqs.includes("Approach") || selectedFreqs.includes("Departure")
    const hasLocal = selectedFreqs.includes("Tower") || selectedFreqs.includes("Ground")
    if (hasCenter && selectedFreqs.length > 1) return true
    if (hasRadar && hasLocal) return true
    return false
  }

  const submit = async () => {
    if (!date || !icao || !open || !close || selectedFreqs.length === 0) {
      toast.error("Please fill all required fields and select frequencies")
      return
    }

    if (hasInvalidCombo() && !isSupervisor) {
      toast.error("Invalid frequency combination for standard controllers")
      return
    }

    setLoading(true)
    const { error } = await supabase
      .from("atc_pireps")
      .insert({
        user_id: user?.id,
        date,
        airport_icao: icao.toUpperCase(),
        freq_open_time: open,
        freq_close_time: close,
        multiplier: Number(multiplier),
        remarks,
        selected_frequencies: selectedFreqs,
        is_supervisor_override: isSupervisor,
        status: "pending"
      })

    if (error) {
      console.error(error)
      toast.error("Failed to submit PIREP")
      setLoading(false)
      return
    }

    await sendDiscordEmbed({
      title: "📡 New ATC PIREP Submitted",
      color: isSupervisor ? 3066993 : 15105570,
      description: `\n👨‍✈️ **Controller:** ${pilot?.full_name || 'Pilot'} (${pilot?.pid || 'N/A'})\n\n✈️ **Airport:** ${icao.toUpperCase()}\n\n📡 **Freqs:** ${selectedFreqs.join(", ")}${isSupervisor ? " **(Supervisor Mode)**" : ""}\n\n⏱️ **Session:** ${open} — ${close}`
    });

    setLoading(false)
    toast.success("ATC PIREP submitted successfully")
    setIcao("")
    setOpen("")
    setClose("")
    setRemarks("")
    setSelectedFreqs([])
  }

  return (
    <div className="max-w-xl mx-auto p-6 animate-in fade-in duration-500">
      <Card className="border-primary/20 shadow-2xl bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
            <Radio size={22} className="text-primary" /> File ATC PIREP
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-background" />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Airport ICAO</Label>
              <Input placeholder="RKSI" className="uppercase font-mono bg-background" value={icao} onChange={(e) => setIcao(e.target.value)} />
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-border bg-muted/30 dark:bg-white/[0.03] space-y-4 shadow-inner">
            <div className="flex justify-between items-center">
              <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/80">Active Frequencies</Label>
              {isSupervisor && <ShieldCheck size={14} className="text-success animate-bounce" />}
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {freqOptions.map((freq) => {
                const isActive = selectedFreqs.includes(freq.id);
                return (
                  <button
                    key={freq.id}
                    type="button"
                    onClick={() => toggleFreq(freq.id)}
                    className={cn(
                      "transition-all duration-300 py-2.5 px-2 rounded-xl border text-[11px] font-bold uppercase tracking-tighter",
                      isActive 
                        ? "bg-success/20 border-success/50 text-success shadow-sm scale-[0.98]" 
                        : "bg-background border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    {freq.label}
                  </button>
                )
              })}
            </div>

            {hasInvalidCombo() && (
              <div className="flex items-start gap-2 text-[10px] leading-tight text-destructive bg-destructive/10 p-3 rounded-lg border border-destructive/20 animate-in zoom-in-95">
                <Info size={14} className="shrink-0" />
                <p>Standard controllers cannot mix Local (G/T), Radar (A/D), or Center frequencies simultaneously.</p>
              </div>
            )}

            <div className="flex items-center space-x-3 pt-3 border-t border-border">
              <Checkbox 
                id="supervisor" 
                className="data-[state=checked]:bg-success data-[state=checked]:border-success"
                checked={isSupervisor} 
                onCheckedChange={(checked) => setIsSupervisor(!!checked)}
              />
              <label htmlFor="supervisor" className="text-[11px] font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">
                Supervisor Exemption (Manual Override)
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase font-bold">Open (Z)</Label>
              <Input type="time" value={open} onChange={(e) => setOpen(e.target.value)} className="bg-background" />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase font-bold">Close (Z)</Label>
              <Input type="time" value={close} onChange={(e) => setClose(e.target.value)} className="bg-background" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">Session Multiplier</Label>
            <Select value={multiplier} onValueChange={setMultiplier}>
              <SelectTrigger className="bg-background border-input">
                <SelectValue placeholder="Select Multiplier" />
              </SelectTrigger>
              <SelectContent>
                {/* Dynamically mapped from JSON */}
                {multiplierData.multipliers.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">Additional Remarks</Label>
            <Textarea 
              placeholder="Traffic details, handoffs, or notable events..."
              className="bg-background border-input min-h-[100px] resize-none focus:ring-primary/30" 
              value={remarks} 
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

          <Button 
            className={cn(
              "w-full h-12 text-sm font-black uppercase tracking-widest transition-all shadow-lg",
              hasInvalidCombo() && !isSupervisor 
                ? "bg-muted text-muted-foreground cursor-not-allowed" 
                : "bg-primary hover:bg-primary/90 hover:shadow-primary/20 text-primary-foreground"
            )}
            onClick={submit} 
            disabled={loading || (hasInvalidCombo() && !isSupervisor)}
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : "Submit PIREP"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
