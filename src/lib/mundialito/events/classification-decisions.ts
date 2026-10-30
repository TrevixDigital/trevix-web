import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TournamentData } from "../domain/types.ts";
import type { CalendarMetadata } from "../supabase/read-types.ts";
import { calculateTournament } from "../engine/tournament.ts";
import { regulatoryReview } from "../engine/regulatory.ts";
import { RosterError, isUuid } from "../players/model.ts";
import { classificationCircuit } from "../engine/classification.ts";

export interface ClassificationDecision {
  id:string; tournament_id:string;kind:string;scope_key:string;basis_fingerprint:string;
  published_payload:Record<string,unknown>;document_reference:string;recorded_at:string;is_current:boolean;
}
export interface ClassificationRequest {
  kind:"draw"|"third_assignment";scope:string;basis:string;teams:string[];
  alternatives:Readonly<Record<string,string>>[];
}
const hash=(text:string)=>createHash("sha256").update(text).digest("hex");
function canonical(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
  if(value&&typeof value==="object")return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export const sameDecisionPayload=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
/** Exact PostgreSQL jsonb::text for the deliberately single-key basis snapshot. */
export function decisionFingerprint(basis:string) {return hash(`{"application_basis": "${basis}"}`);}
function groupsOnly(input:TournamentData):TournamentData {
  const ids=new Set(input.fixtures.filter(f=>f.stage==="groups").map(f=>f.id));
  return {...input,results:input.results.filter(r=>ids.has(r.matchId)),events:input.events.filter(e=>ids.has(e.matchId)),
    eventCoverage:input.eventCoverage.filter(id=>ids.has(id)),disciplineCoverage:input.disciplineCoverage.filter(id=>ids.has(id)),provisionalDisciplineCoverage:input.provisionalDisciplineCoverage?.filter(c=>ids.has(c.matchId))};
}
function basis(data:TournamentData,scope:string,teams:string[]) {
  const group=scope.startsWith("group:")?scope.slice(6):null;
  const ids=new Set(data.fixtures.filter(f=>f.stage==="groups"&&(!group||f.group===group)).map(f=>f.id));
  const sort=<T>(rows:readonly T[],key:(r:T)=>string)=>[...rows].sort((a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0);
  return hash(canonical({version:1,scope,teams:[...teams].sort(),fixtures:sort(data.fixtures.filter(f=>ids.has(f.id)).map(f=>({id:f.id,stage:f.stage,group:f.group,homeTeamId:f.homeTeamId,awayTeamId:f.awayTeamId})),f=>f.id),
    results:sort(data.results.filter(r=>ids.has(r.matchId)),r=>r.matchId),cards:sort(data.events.filter(e=>ids.has(e.matchId)&&["yellow","red","second-yellow"].includes(e.kind)).map(e=>({id:e.id,matchId:e.matchId,teamId:e.teamId,playerId:e.playerId,kind:e.kind,dismissalCause:e.dismissalCause,disciplineUncertified:e.disciplineUncertified})),e=>e.id),
    coverage:[...data.disciplineCoverage].filter(id=>ids.has(id)).sort(),provisional:sort((data.provisionalDisciplineCoverage??[]).filter(c=>ids.has(c.matchId)),c=>`${c.matchId}:${c.teamId}`),
    interpretation:data.interpretation,draws:sort(data.draws.filter(d=>scope==="third-assignment"||(!group&&d.context.startsWith("group:"))),d=>`${d.context}:${[...d.orderedTeamIds].sort().join(",")}`)}));
}
export function classificationConfirmationBasis(input:TournamentData) {
  const circuit=classificationCircuit(groupsOnly(input));
  return hash(canonical({version:1,purpose:"confirm-round16",source:basis(groupsOnly(input),"third-assignment",[]),
    qualifiers:circuit.qualifiers.map(r=>r.team.slug).sort(),octavos:circuit.octavos.map(m=>({id:m.id,home:m.home.teamId,away:m.away.teamId}))}));
}
export function classificationRequests(input:TournamentData):ClassificationRequest[] {
  const data=groupsOnly(input),snapshot=calculateTournament(data),review=regulatoryReview(snapshot);
  const requests:ClassificationRequest[]=review.draws.map(d=>({kind:"draw",scope:d.context,teams:d.teamIds,basis:basis(data,d.context,d.teamIds),alternatives:[]}));
  if(review.assignmentDraw)requests.push({kind:"third_assignment",scope:"third-assignment",teams:snapshot.thirds.filter(t=>t.position!==null&&t.position<=4).map(t=>t.team.slug),basis:basis(data,"third-assignment",[]),alternatives:[...snapshot.assignment.alternatives]});
  return requests;
}

/** Replay only documented, published decisions that match an actually pending tie.
 * Process group draws before thirds/leaders; a stale decision never overrides math.
 */
export function applyClassificationDecisions(input:TournamentData,rows:readonly ClassificationDecision[],metadata:CalendarMetadata) {
  let data=input;
  const applied:string[]=[],issues:{id:string;reason:string}[]=[];
  const unused=new Set(rows.filter(r=>r.is_current&&["draw","third_assignment"].includes(r.kind)).map(r=>r.id));
  for(let pass=0;pass<12;pass++) {
    let progress=false;
    for(const request of classificationRequests(data)) {
      const candidates=rows.filter(r=>unused.has(r.id)&&r.kind===request.kind&&r.scope_key===request.scope&&r.basis_fingerprint===decisionFingerprint(request.basis));
      if(candidates.length!==1)continue;
      const row=candidates[0];
      if(!row.document_reference.trim()||!Number.isFinite(Date.parse(row.recorded_at)))continue;
      const slug=(id:unknown)=>metadata.teams.find(t=>t.id===id)?.localSlug;
      if(request.kind==="draw") {
        const raw=row.published_payload.ordered_team_ids;
        const ordered=Array.isArray(raw)?raw.map(slug):[];
        if(ordered.length!==request.teams.length||new Set(ordered).size!==ordered.length||ordered.some(id=>!id||!request.teams.includes(id)))continue;
        data={...data,draws:[...data.draws,{context:request.scope,orderedTeamIds:ordered as string[],documentReference:row.document_reference}]};
      } else {
        const raw=row.published_payload.team_by_leader_group as Record<string,unknown>|undefined;
        if(!raw||Object.keys(raw).length!==4)continue;
        const chosen=Object.fromEntries(["A","B","C","D"].map(g=>[g,slug(raw[g])]));
        if(!request.alternatives.some(a=>["A","B","C","D"].every(g=>a[g]===chosen[g])))continue;
        data={...data,assignmentResolution:{teamByLeaderGroup:chosen as Record<"A"|"B"|"C"|"D",string>,documentReference:row.document_reference}};
      }
      unused.delete(row.id);applied.push(row.id);progress=true;
    }
    if(!progress)break;
  }
  const circuit=classificationCircuit(groupsOnly(data));
  const confirmationBasis=classificationConfirmationBasis(data);
  const confirmations=rows.filter(r=>unused.has(r.id)&&r.kind==="third_assignment"&&r.scope_key==="third-assignment"&&r.basis_fingerprint===decisionFingerprint(confirmationBasis)&&
    r.document_reference.trim()&&Number.isFinite(Date.parse(r.recorded_at))&&["A","B","C","D"].every(g=>metadata.teams.find(t=>t.id===(r.published_payload.team_by_leader_group as Record<string,unknown>|undefined)?.[g])?.localSlug===circuit.calculation.assignment.byGroup[g as "A"]));
  const confirmation=circuit.ready&&confirmations.length===1?confirmations[0]:null;
  if(confirmation)unused.delete(confirmation.id);
  for(const id of unused)issues.push({id,reason:"Decisión desactualizada, incompatible o en conflicto; no se aplicó."});
  // Confirmation of the sporting assignment is not enough if a coordinated
  // participant save stopped halfway. Public definitive pairings require all 8.
  const persisted=circuit.ready&&circuit.octavos.every(m=>{
    const row=metadata.matches.find(r=>r.localId===m.id);
    return row&&metadata.teams.find(t=>t.id===row.homeTeamId)?.localSlug===m.home.teamId&&metadata.teams.find(t=>t.id===row.awayTeamId)?.localSlug===m.away.teamId;
  });
  return {data,applied,issues,requests:classificationRequests(data),circuit,confirmationBasis,confirmation,persisted};
}
export async function readClassificationDecisions(client:SupabaseClient,metadata:CalendarMetadata) {
  const all:ClassificationDecision[]=[];let expected:number|undefined;
  for(let page=0;page<100;page++) {
    const r=await client.from("mundialito_public_decisions").select("id,tournament_id,kind,scope_key,published_payload,basis_fingerprint,document_reference,recorded_at,is_current",{count:"exact"}).eq("tournament_id",metadata.tournament.id).order("id").range(all.length,all.length+99);
    if(r.error||!Array.isArray(r.data)||r.count===null||(expected!==undefined&&r.count!==expected))throw new RosterError("DECISIONS_READ","No se pudieron leer todos los sorteos publicados; no se supondrá que no existen.");
    expected=r.count;
    for(const row of r.data) {
      if(!isUuid(row.id)||row.tournament_id!==metadata.tournament.id||typeof row.kind!=="string"||typeof row.scope_key!=="string"||typeof row.document_reference!=="string"||typeof row.recorded_at!=="string"||typeof row.is_current!=="boolean"||!/^[a-f0-9]{64}$/.test(row.basis_fingerprint)||!row.published_payload||typeof row.published_payload!=="object")throw new RosterError("DECISIONS_DATA","Sorteo publicado con datos inválidos.");
      all.push(row as ClassificationDecision);
    }
    if(new Set(all.map(r=>r.id)).size!==all.length)throw new RosterError("DECISIONS_READ","Lectura concurrente de sorteos; recarga.");
    if(all.length===expected)return all;
    if(!r.data.length||all.length>expected)break;
  }
  throw new RosterError("DECISIONS_READ","Lectura incompleta de sorteos.");
}
