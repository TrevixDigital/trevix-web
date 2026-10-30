"use server";
import { revalidatePath } from "next/cache";
import { serverAdminClient } from "@/lib/mundialito/admin/server";
import { saveClassificationDecision } from "@/lib/mundialito/matches/classification-admin";
import { syncConfirmedParticipants } from "@/lib/mundialito/matches/sync";
import { readAdminMatches } from "@/lib/mundialito/matches/repository";
import { RosterError } from "@/lib/mundialito/players/model";
import type { ClassificationRequest } from "@/lib/mundialito/events/classification-decisions";
export interface ClassificationFormState {error:string;success?:string;warnings?:string[]}
function invalidate() {
  for(const p of ["/mundialito","/mundialito/grupos","/mundialito/eliminatorias","/mundialito/fase-final","/mundialito/partidos","/mundialito/equipos","/mundialito/estadisticas","/mundialito/admin/reglamento","/mundialito/admin/partidos"])revalidatePath(p);
  for(const p of ["/mundialito/equipos/[slug]","/mundialito/partidos/[id]","/mundialito/admin/partidos/[id]/editar"])revalidatePath(p,"page");
}
export async function recordDrawAction(binding:ClassificationRequest&{id:string},_state:ClassificationFormState,form:FormData):Promise<ClassificationFormState> {
  try {
    const saved=await saveClassificationDecision(await serverAdminClient(true),{id:binding.id,basis:binding.basis,scope:binding.scope,kind:binding.kind,
      orderedTeamIds:form.getAll("ordered").map(String),alternative:Number(form.get("alternative")),documentReference:String(form.get("reference")??"")});
    return {error:"",success:saved.repeated?"El resultado ya estaba registrado; no se duplicó.":"Resultado del sorteo guardado. La clasificación se recalcula automáticamente."};
  }catch(e){return {error:e instanceof RosterError?e.message:"No se confirmó el sorteo. Recarga para comprobar si quedó registrado antes de reintentar."};}
  finally{invalidate();}
}
export async function publishClassificationAction(binding:{id:string;basis:string},_state:ClassificationFormState,_form:FormData):Promise<ClassificationFormState> {
  void _state; void _form;
  try {
    const client=await serverAdminClient(true);
    await saveClassificationDecision(client,{...binding,scope:"third-assignment",kind:"third_assignment",documentReference:"",confirmPublication:true});
    const result=await syncConfirmedParticipants(client,{sportingBasis:binding.basis});
    const after=await readAdminMatches(client,true);
    if(result.warnings.length||!after.classification?.persisted||after.competition.publication.status!=="official")
      return {error:"No se completó la publicación de los ocho octavos. Revisa los avisos y recarga antes de reintentar; los cruces ya guardados no se duplican.",warnings:result.warnings};
    return {error:"",success:"Los 16 clasificados y los ocho enfrentamientos de octavos están confirmados y publicados."};
  }catch(e){return {error:e instanceof RosterError?e.message:"No se pudo confirmar la publicación completa. Puede haber cruces ya guardados; recarga para revisar."};}
  finally{invalidate();}
}
