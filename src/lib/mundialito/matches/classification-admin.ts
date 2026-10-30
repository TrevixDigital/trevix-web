import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyAdmin } from "../admin/client.ts";
import { readAdminMatches } from "./repository.ts";
import { isUuid, RosterError } from "../players/model.ts";
import { classificationRequests, decisionFingerprint, sameDecisionPayload } from "../events/classification-decisions.ts";
import { classificationWritesEnabled } from "../events/classification-capabilities.ts";
export { classificationWritesEnabled } from "../events/classification-capabilities.ts";
export interface ClassificationSaveInput {
  id:string;basis:string;scope:string;kind:"draw"|"third_assignment";
  orderedTeamIds?:string[];alternative?:number;documentReference:string;confirmPublication?:boolean;
}
export async function saveClassificationDecision(client:SupabaseClient,input:ClassificationSaveInput) {
  if(await verifyAdmin(client)!=="allowed")throw new RosterError("ACCESS","Se requiere una sesión administrativa válida.");
  if(!classificationWritesEnabled())throw new RosterError("CAPABILITY","El registro de sorteos y la publicación de octavos están preparados, pero su escritura no está activada en este entorno.");
  if(!isUuid(input.id)||!/^[a-f0-9]{64}$/.test(input.basis)||typeof input.documentReference!=="string"||input.documentReference.length>1000)
    throw new RosterError("VALIDATION","Identidad o referencia de la operación inválida.");
  const context=await readAdminMatches(client,true);
  const classification=context.classification;
  if(!classification)throw new RosterError("READ","Falta la lectura completa de clasificación.");
  const attempted=await client.from("mundialito_decisions").select("id,kind,scope_key,basis_fingerprint,payload,document_reference,published").eq("id",input.id).eq("tournament_id",context.metadata.tournament.id).maybeSingle();
  if(attempted.error)throw new RosterError("READ","No se pudo verificar el intento anterior. Recarga antes de reintentar.");
  if(attempted.data&&input.kind==="draw") {
    const expected={ordered_team_ids:(input.orderedTeamIds??[]).map(slug=>context.metadata.teams.find(t=>t.localSlug===slug)?.id)};
    if(attempted.data.kind!==input.kind||attempted.data.scope_key!==input.scope||attempted.data.basis_fingerprint!==decisionFingerprint(input.basis)||attempted.data.published!==true||attempted.data.document_reference!==input.documentReference.trim()||!sameDecisionPayload(attempted.data.payload,expected))
      throw new RosterError("REUSED","Este intento ya guardó otros datos. Recarga para revisar el resultado registrado.");
    return {id:input.id,repeated:true};
  }
  let payload:Record<string,unknown>;
  if(input.confirmPublication) {
    if(!classification.circuit.ready||classification.confirmationBasis!==input.basis||input.kind!=="third_assignment"||input.scope!=="third-assignment")
      throw new RosterError("STALE","La clasificación cambió o faltan partidos/desempates. Recarga antes de confirmar.");
    payload={team_by_leader_group:Object.fromEntries(Object.entries(classification.circuit.calculation.assignment.byGroup).map(([g,slug])=>[g,context.metadata.teams.find(t=>t.localSlug===slug)!.id]))};
  } else {
    if(!input.documentReference.trim())throw new RosterError("VALIDATION","Escribe la referencia del acta del sorteo realizado.");
    const request=classificationRequests(input.kind==="third_assignment"?{...context.data,assignmentResolution:undefined}:context.data).find(r=>r.kind===input.kind&&r.scope===input.scope&&r.basis===input.basis);
    if(!request)throw new RosterError("STALE","Este sorteo ya no es necesario o sus datos cambiaron. Recarga.");
    if(input.kind==="draw") {
      const ids=input.orderedTeamIds??[];
      if(ids.length!==request.teams.length||new Set(ids).size!==ids.length||ids.some(id=>!request.teams.includes(id)))
        throw new RosterError("VALIDATION","Ordena una vez cada equipo participante en el sorteo.");
      payload={ordered_team_ids:ids.map(slug=>context.metadata.teams.find(t=>t.localSlug===slug)!.id)};
    } else {
      const selected=Number.isInteger(input.alternative)?request.alternatives[input.alternative!]:undefined;
      if(!selected)throw new RosterError("VALIDATION","Selecciona una de las asignaciones válidas del artículo 12.");
      payload={team_by_leader_group:Object.fromEntries(Object.entries(selected).map(([g,slug])=>[g,context.metadata.teams.find(t=>t.localSlug===slug)!.id]))};
    }
  }
  const user=await client.auth.getUser();
  if(user.error||!user.data.user)throw new RosterError("ACCESS","La sesión caducó. Inicia sesión otra vez.");
  const row={id:input.id,tournament_id:context.metadata.tournament.id,kind:input.kind,scope_key:input.scope,
    reason:input.confirmPublication?"Confirmación deportiva de los 16 clasificados y asignación de los ocho octavos":"Resultado documentado de sorteo reglamentario",
    article_reference:input.kind==="draw"?"11":"12",document_reference:input.documentReference.trim()||`Confirmación web ${input.id}`,
    basis_snapshot:{application_basis:input.basis},basis_fingerprint:decisionFingerprint(input.basis),payload,published:true,recorded_by:user.data.user.id};
  // Same basis is UNIQUE in revision 4: concurrent conflicting draws cannot both win.
  const existing=await client.from("mundialito_decisions").select("id,payload,document_reference,basis_fingerprint,published").eq("tournament_id",row.tournament_id).eq("kind",row.kind).eq("scope_key",row.scope_key).eq("basis_fingerprint",row.basis_fingerprint).maybeSingle();
  if(existing.error)throw new RosterError("READ","No se pudo comprobar si esta decisión ya estaba guardada.");
  if(existing.data) {
    if(existing.data.published!==true||!sameDecisionPayload(existing.data.payload,payload))throw new RosterError("CONFLICT","Otro administrador registró un resultado diferente o no publicado. Recarga; no se sobrescribió.");
    return {id:existing.data.id as string,repeated:true};
  }
  const response=await client.from("mundialito_decisions").insert(row).select("id,basis_fingerprint").single();
  if(response.error||response.data?.id!==row.id||response.data?.basis_fingerprint!==row.basis_fingerprint)
    throw new RosterError("SAVE",`No se confirmó el registro (${response.error?.code??"respuesta inválida"}). Puede haber quedado guardado; recarga antes de reintentar. No se eludirán RLS ni auditoría.`);
  return {id:row.id,repeated:false};
}
