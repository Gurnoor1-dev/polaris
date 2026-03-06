import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/integrations/supabase/client"

import { Card,CardHeader,CardTitle,CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { Check,X,Pause } from "lucide-react"

export default function AdminAtcPireps(){

const qc = useQueryClient()

const { data } = useQuery({
queryKey:["atc_pireps"],
queryFn: async()=>{

const { data,error } = await supabase
.from("atc_pireps")
.select("*")
.order("created_at",{ascending:false})

if(error) throw error

return data
}
})

const updateStatus = useMutation({

mutationFn: async({id,status}:{id:string,status:string})=>{

const { error } = await supabase
.from("atc_pireps")
.update({status})
.eq("id",id)

if(error) throw error

},

onSuccess:()=>{
qc.invalidateQueries({queryKey:["atc_pireps"]})
}

})

return(

<div className="p-6 space-y-4">

<h1 className="text-2xl font-bold">
ATC PIREPs
</h1>

{data?.map((pirep:any)=>(
<Card key={pirep.id}>

<CardHeader>

<CardTitle className="flex justify-between">

{pirep.airport_icao}

<Badge>
{pirep.status}
</Badge>

</CardTitle>

</CardHeader>

<CardContent className="space-y-2">

<div>Date: {pirep.date}</div>

<div>
Frequency: {pirep.freq_open_time} → {pirep.freq_close_time}
</div>

<div>
Multiplier: {pirep.multiplier}x
</div>

<div>
Calculated Hours: {pirep.calculated_hours}
</div>

{pirep.remarks && (
<div>
Remarks: {pirep.remarks}
</div>
)}

<div className="flex gap-2 pt-2">

<Button
size="sm"
onClick={()=>updateStatus.mutate({
id:pirep.id,
status:"approved"
})}
>
<Check size={16}/>
</Button>

<Button
size="sm"
variant="destructive"
onClick={()=>updateStatus.mutate({
id:pirep.id,
status:"rejected"
})}
>
<X size={16}/>
</Button>

<Button
size="sm"
variant="secondary"
onClick={()=>updateStatus.mutate({
id:pirep.id,
status:"pending"
})}
>
<Pause size={16}/>
</Button>

</div>

</CardContent>

</Card>
))}

</div>

)

}
