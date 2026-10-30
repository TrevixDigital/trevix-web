import { bracketDefinitions,knockoutOutcome } from "../engine/bracket.ts";
import { phase4Capabilities } from "../events/capabilities.ts";
import type { readAdminMatches } from "./repository.ts";
import type { MatchValues } from "./model.ts";
import { RosterError } from "../players/model.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
export async function assertKnockoutDatabaseReady(client:SupabaseClient) {
  const r=await client.rpc("mundialito_knockout_status",undefined,{get:true});
  if(r.error||r.data?.version!==2||r.data?.progression_enabled!==true)
    throw new RosterError("CAPABILITY","El avance seguro sigue desactivado o no está disponible en la base de datos. No se guardó ninguna sección del acta.");
}
export function knockoutProgressionEnabled(env:Record<string,string|undefined>=process.env) {
  const c=phase4Capabilities(env);
  return c.read&&env.SUPABASE_KNOCKOUT_PROGRESS_ENABLED==="true"&&(c.isolated||(
    env.SUPABASE_PHASE4_WRITE_TARGET==="production"&&env.SUPABASE_KNOCKOUT_PRODUCTION_WRITES_APPROVED==="true"&&env.NEXT_PUBLIC_SUPABASE_URL==="https://vhryyxplhefmpykumvma.supabase.co"));
}
/** Match SQL rejects these changes without the atomic knockout RPC. Fail before
 * the simple coordinator commits any independent card or goal operations. */
export function assertKnockoutResultWriteEnabled(
  phase:string,before:Record<string,unknown>|MatchValues,target:MatchValues,
  env:Record<string,string|undefined>=process.env,
) {
  if(phase==="groups")return;
  const changed=(["status","home_score","away_score","home_penalties","away_penalties"] as const)
    .some(key=>before[key]!==target[key]);
  if(changed&&!knockoutProgressionEnabled(env))
    throw new RosterError("CAPABILITY","El avance seguro de eliminatorias está desactivado. No se guardó ninguna sección; revisa su activación antes de cambiar el resultado o los penales.");
}
/** Early UX check before the simple coordinator writes events. SQL rechecks atomically. */
export function assertKnockoutDependencies(context:Awaited<ReturnType<typeof readAdminMatches>>,id:string,target:MatchValues) {
  const source=context.metadata.matches.find(m=>m.id===id);
  if(!source||source.phase==="groups")return;
  const outcome=target.status==="finished"&&target.home_score!==null&&target.away_score!==null?
    knockoutOutcome(source.homeTeamId??undefined,source.awayTeamId??undefined,target.home_score,target.away_score,
      target.home_penalties!==null&&target.away_penalties!==null?{home:target.home_penalties,away:target.away_penalties}:undefined):{winnerId:undefined,loserId:undefined};
  for(const child of bracketDefinitions)for(const side of ["home","away"] as const) {
    if(!["W:"+source.localId,"L:"+source.localId].includes(child[side]))continue;
    const next=context.metadata.matches.find(m=>m.localId===child.id)!;
    const desired=(child[side].startsWith("W:")?outcome.winnerId:outcome.loserId)??null;
    const current=side==="home"?next.homeTeamId:next.awayTeamId;
    if(current===desired)continue;
    const row=context.records.find(r=>r.id===next.id)!;
    if(next.status!=="scheduled"||["home_score","away_score","home_penalties","away_penalties","notes"].some(k=>row[k]!==null)||context.events?.some(e=>e.match_id===next.id))
      throw new RosterError("DEPENDENCY",`No se puede cambiar quién avanza: ${child.id} ya tiene estado, resultado, eventos o información registrada. Revisa sus dependencias antes de corregir el partido anterior.`);
  }
}
