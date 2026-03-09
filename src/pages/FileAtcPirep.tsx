import { useState } from "react"
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Radio, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { sendDiscordEmbed } from "@/lib/discord-notify"

export default function FileAtcPirep(){
  const { user, pilot } = useAuth()
  const [date,setDate] = useState("")
  const [icao,setIcao] = useState("")
  const [open,setOpen] = useState("")
  const [close,setClose] = useState("")
  const [multiplier,setMultiplier] = useState("1")
  const [remarks,setRemarks] = useState("")
  const [loading,setLoading] = useState(false)

  const submit = async () => {
    if(!date || !icao || !open || !close){
      toast.error("Please fill all required fields")
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
        status:"pending"
      })

    if(error){
      toast.error("Failed to submit PIREP")
      setLoading(false)
      return
    }

    // Send Discord Notification
    await sendDiscordEmbed({
      title: "📡 New ATC PIREP Submitted",
      color: 15105570,
      description: `\n👨‍✈️ **Controller:** ${pilot?.full_name || 'Pilot'} (${pilot?.pid || pilot?.callsign || 'N/A'}*)\n\n✈️ **Airport:** ${icao.toUpperCase()}\n\n⏱️ **Session:** ${open} — ${close}\n\n[View ATC PIREP](https://your-site.com/atc-log)`
    });

    setLoading(false)
    toast.success("ATC PIREP submitted")
  }

  return(
    <div className="max-w-xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio size={18}/> File ATC PIREP
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e)=>setDate(e.target.value)}/>
          </div>
          <div>
            <Label>Airport ICAO</Label>
            <Input placeholder="VIDP" value={icao} onChange={(e)=>setIcao(e.target.value)}/>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Frequency Opening Time</Label>
              <Input type="time" value={open} onChange={(e)=>setOpen(e.target.value)}/>
            </div>
            <div>
              <Label>Frequency Closing Time</Label>
              <Input type="time" value={close} onChange={(e)=>setClose(e.target.value)}/>
            </div>
          </div>
          <div>
            <Label>Multiplier</Label>
            <Select value={multiplier} onValueChange={setMultiplier}>
              <SelectTrigger><SelectValue placeholder="Multiplier"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">none</SelectItem>
                <SelectItem value="1.5">1.5x (General IFATC Controlling)</SelectItem>
                <SelectItem value="4">4x (KEVA In-House/IFC Event KEVA attending)</SelectItem>
                <SelectItem value="6">6x (KEVA IFC Event)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Remarks</Label>
            <Textarea value={remarks} onChange={(e)=>setRemarks(e.target.value)}/>
          </div>
          <Button className="w-full" onClick={submit} disabled={loading}>
            {loading && <Loader2 className="animate-spin mr-2" size={16}/>}
            Submit ATC PIREP
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
