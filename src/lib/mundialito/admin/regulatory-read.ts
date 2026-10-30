import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyAdmin } from "./client.ts";
import { isUuid, RosterError } from "../players/model.ts";
import type { ReadRow } from "../supabase/read-types.ts";

async function scope(client:SupabaseClient,tournamentId:string) {
  if(await verifyAdmin(client)!=="allowed")throw new RosterError("ACCESS","Se requiere autorización administrativa para consultar el historial.");
  if(!isUuid(tournamentId))throw new RosterError("SCOPE","Torneo inválido.");
  const t=await client.from("tournaments").select("id").eq("slug","mundialito-la-bomba-2026").single();
  if(t.error||t.data?.id!==tournamentId)throw new RosterError("SCOPE","El historial no pertenece al torneo oficial.");
}
async function paged(client:SupabaseClient,table:string,columns:string,tournamentId:string,matchId?:string) {
  const rows:ReadRow[]=[];let expected:number|undefined;
  for(let page=0;page<100;page++) {
    let query=client.from(table).select(columns,{count:"exact"});
    if(table!=="match_audit_log")query=query.eq("tournament_id",tournamentId);
    if(matchId)query=query.eq("match_id",matchId);
    if(table!=="match_audit_log")query=query.order("recorded_at");
    const r=await query.order("id").range(rows.length,rows.length+99);
    if(r.error||!Array.isArray(r.data)||r.count===null||!Number.isSafeInteger(r.count)||r.count<0||(expected!==undefined&&expected!==r.count))
      throw new RosterError("HISTORY_READ","No se pudo leer el historial completo. No se asumirá que está vacío.");
    expected=r.count;rows.push(...r.data as unknown as ReadRow[]);
    if(new Set(rows.map(r=>r.id)).size!==rows.length)throw new RosterError("HISTORY_READ","Historial duplicado o concurrente; recarga.");
    if(rows.length===expected)return rows;
    if(!r.data.length||rows.length>expected)break;
  }
  throw new RosterError("HISTORY_READ","Lectura parcial del historial; recarga.");
}
const auditFields=["status","scheduled_at","venue","home_team_id","away_team_id","home_score","away_score","home_penalties","away_penalties","team_id","player_id","event_type","minute","notes","dismissal_cause","goals_complete","cards_complete","cards_recorded_at"];
export interface AuditEntry { id:string;actorId:string;at:string|null;entity:string;action:string;changes:{field:string;before:unknown;after:unknown}[] }
export function auditEntry(row:ReadRow,regulatory:boolean):AuditEntry {
  const before=(row.old_data??{}) as Record<string,unknown>,after=(row.new_data??{}) as Record<string,unknown>;
  const actor=row[regulatory?"actor_id":"changed_by"],at=regulatory?row.recorded_at:after.updated_at??before.updated_at??null;
  if(!isUuid(row.id)||!isUuid(actor)||!["INSERT","UPDATE","DELETE"].includes(String(row.action))||
    (at!==null&&(typeof at!=="string"||!Number.isFinite(Date.parse(at)))))throw new RosterError("HISTORY_DATA","Entrada de auditoría inválida.");
  return {id:row.id as string,actorId:actor as string,at:at as string|null,entity:regulatory?String(row.entity):"match",action:String(row.action),
    changes:auditFields.filter(k=>JSON.stringify(before[k])!==JSON.stringify(after[k])).map(field=>({field,before:before[field]??null,after:after[field]??null}))};
}
export async function readMatchHistory(client:SupabaseClient,tournamentId:string,matchId:string) {
  await scope(client,tournamentId);
  if(!isUuid(matchId))throw new RosterError("SCOPE","Partido inválido.");
  const match=await client.from("matches").select("id").eq("id",matchId).eq("tournament_id",tournamentId).single();
  if(match.error||!match.data)throw new RosterError("SCOPE","Partido ajeno al torneo.");
  const [matches,events]=await Promise.all([
    paged(client,"match_audit_log","id,match_id,changed_by,action,old_data,new_data",tournamentId,matchId),
    paged(client,"regulatory_audit_log","id,tournament_id,match_id,entity,entity_id,action,actor_id,recorded_at,old_data,new_data",tournamentId,matchId),
  ]);
  if(matches.some(r=>r.match_id!==matchId)||events.some(r=>r.tournament_id!==tournamentId||r.match_id!==matchId))throw new RosterError("SCOPE","Auditoría fuera del encuentro.");
  return [...matches.map(r=>auditEntry(r,false)),...events.map(r=>auditEntry(r,true))].sort((a,b)=>(b.at??"").localeCompare(a.at??""));
}
export const DECISION_COLUMNS="id,tournament_id,match_id,player_id,kind,scope_key,reason,article_reference,document_reference,recorded_by,recorded_at,supersedes_id";
export async function readDecisionRegister(client:SupabaseClient,tournamentId:string) {
  await scope(client,tournamentId);
  const rows=await paged(client,"mundialito_decisions",DECISION_COLUMNS,tournamentId);
  for(const row of rows)if(row.tournament_id!==tournamentId||!isUuid(row.id)||!isUuid(row.recorded_by)||typeof row.recorded_at!=="string"||!Number.isFinite(Date.parse(row.recorded_at))||
    ["kind","scope_key","reason","article_reference","document_reference"].some(k=>typeof row[k]!=="string"||!(row[k] as string).trim())||
    (row.supersedes_id!==null&&!isUuid(row.supersedes_id)))throw new RosterError("DECISION_DATA","Registro de decisiones inválido.");
  return rows.map((row):ReadRow & {current:boolean}=>({...row,current:!rows.some(r=>r.supersedes_id===row.id)}));
}
