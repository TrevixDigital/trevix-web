import test from "node:test";
import assert from "node:assert/strict";
import { calendarRows, uuid } from "./supabase-fixtures.ts";
import { mapSupabaseCalendar } from "../../src/lib/mundialito/adapters/supabase-calendar.ts";
import { classificationCircuit } from "../../src/lib/mundialito/engine/classification.ts";
import { classificationRequests,applyClassificationDecisions,decisionFingerprint,sameDecisionPayload,type ClassificationDecision } from "../../src/lib/mundialito/events/classification-decisions.ts";
import { createCompetitionReport } from "../../src/lib/mundialito/repositories/competition-report.ts";
import { classificationWritesEnabled } from "../../src/lib/mundialito/events/classification-capabilities.ts";
import type { TournamentData } from "../../src/lib/mundialito/domain/types.ts";

export function simulatedClassification(tied=false) {
  const rows=calendarRows();
  for(let g=0;g<6;g++)for(let i=0;i<3;i++)Object.assign(rows.matches[g*3+i],{status:"finished",home_score:tied&&g===0?0:i===0?g+1:i===1?g+2:1,away_score:0});
  const snapshot=mapSupabaseCalendar(rows);
  if(tied) {
    const data=snapshot.data,events=[],players=[],coverage=[];
    for(const r of data.results.slice(0,3))for(const teamId of [r.homeTeamId,r.awayTeamId]) {
      const id=`${r.matchId}-${teamId}`;
      players.push({id,name:id,slug:`jugador--${id}`,teamId,shirtNumber:null});
      events.push({id,matchId:r.matchId,teamId,playerId:id,kind:"yellow" as const,disciplineUncertified:true});coverage.push({matchId:r.matchId,teamId});
    }
    Object.assign(data,{players,events,provisionalDisciplineCoverage:coverage});
  }
  return snapshot;
}
function row(snapshot:ReturnType<typeof simulatedClassification>,request:ReturnType<typeof classificationRequests>[number],order:string[],id=uuid(9000)):ClassificationDecision {
  return {id,tournament_id:uuid(1),kind:request.kind,scope_key:request.scope,basis_fingerprint:decisionFingerprint(request.basis),published_payload:{ordered_team_ids:order.map(slug=>snapshot.metadata.teams.find(t=>t.localSlug===slug)!.id)},document_reference:"Acta de sorteo sintética",recorded_at:"2026-10-27T12:00:00Z",is_current:true};
}
test("clasificación: 18 resultados resueltos generan 16 equipos únicos y los ocho octavos reglamentarios",()=>{
  const s=simulatedClassification(),c=classificationCircuit(s.data);
  assert.equal(c.ready,true);assert.equal(c.qualifiers.length,16);assert.equal(new Set(c.qualifiers.map(r=>r.team.slug)).size,16);
  for(const id of ["O7","O8"]) {
    const m=c.octavos.find(m=>m.id===id)!;
    assert.equal(m.home.teamId,c.calculation.groups.find(g=>g.group===(id==="O7"?"A":"B"))!.rows.find(r=>r.position===2)!.team.slug);
    assert.equal(m.away.teamId,c.calculation.groups.find(g=>g.group===(id==="O7"?"D":"C"))!.rows.find(r=>r.position===2)!.team.slug);
  }
  for(const m of c.octavos.slice(0,4))assert.notEqual(s.data.teams.find(t=>t.slug===m.home.teamId)!.group,s.data.teams.find(t=>t.slug===m.away.teamId)!.group);
});
test("clasificación: falta de resultado, partido en juego o empate pendiente impiden cierre",()=>{
  const s=simulatedClassification();
  assert.equal(classificationCircuit({...s.data,results:s.data.results.slice(1)}).ready,false);
  assert.equal(classificationCircuit({...s.data,results:s.data.results.map((r,i)=>i===0?{...r,state:"live"}:r)}).ready,false);
  const tied=simulatedClassification(true);assert.equal(classificationCircuit(tied.data).ready,false);assert.equal(classificationRequests(tied.data)[0].scope,"group:A");
});
test("sorteos: UUID publicados se traducen a slugs y se aplican solo al empate y huella vigentes",()=>{
  const s=simulatedClassification(true),request=classificationRequests(s.data)[0],order=[...request.teams].reverse();
  const record=row(s,request,order),resolved=applyClassificationDecisions(s.data,[record],s.metadata);
  assert.deepEqual(resolved.applied,[record.id]);assert.deepEqual(resolved.circuit.calculation.groups[0].rows.map(r=>r.team.slug),order);assert.equal(resolved.circuit.ready,true);
  const changed={...s.data,results:s.data.results.map((r,i)=>i===0?{...r,homeGoals:1}:r)};
  assert.equal(applyClassificationDecisions(changed,[record],s.metadata).applied.length,0);
  assert.equal(applyClassificationDecisions(s.data,[{...record,document_reference:""}],s.metadata).applied.length,0);
  assert.equal(applyClassificationDecisions(s.data,[record,{...record,id:uuid(9001)}],s.metadata).circuit.ready,false);
});
test("publicación: sin certificados ni aprobación adicional; exige confirmación vigente y ocho cruces guardados",()=>{
  const s=simulatedClassification(),initial=applyClassificationDecisions(s.data,[],s.metadata);
  const confirmation:ClassificationDecision={id:uuid(9002),tournament_id:uuid(1),kind:"third_assignment",scope_key:"third-assignment",basis_fingerprint:decisionFingerprint(initial.confirmationBasis),
    published_payload:{team_by_leader_group:Object.fromEntries(Object.entries(initial.circuit.calculation.assignment.byGroup).map(([g,slug])=>[g,s.metadata.teams.find(t=>t.localSlug===slug)!.id]))},document_reference:"Confirmación web sintética",recorded_at:"2026-10-27T12:00:00Z",is_current:true};
  const partial=applyClassificationDecisions(s.data,[confirmation],s.metadata);assert.ok(partial.confirmation);assert.equal(partial.persisted,false);
  const metadata={...s.metadata,matches:s.metadata.matches.map(m=>{
    const b=initial.circuit.octavos.find(b=>b.id===m.localId);
    return b?{...m,homeTeamId:s.metadata.teams.find(t=>t.localSlug===b.home.teamId)!.id,awayTeamId:s.metadata.teams.find(t=>t.localSlug===b.away.teamId)!.id}:m;
  })};
  const published=applyClassificationDecisions(s.data,[confirmation],metadata);assert.equal(published.persisted,true);
  const data:TournamentData={...published.data,classificationPolicy:"sporting",sportingConfirmation:{id:confirmation.id,basis:published.confirmationBasis}};
  const report=createCompetitionReport(data);assert.equal(report.publication.status,"official");assert.deepEqual(report.publication.blockers,[]);
  assert.deepEqual(data.disciplineCoverage,[]);assert.deepEqual(data.eventCoverage,[]);assert.ok(report.operations.filter(o=>o.projection.stage==="round16").every(o=>o.canPublishOfficial));
  const corrected=createCompetitionReport({...data,results:data.results.map((r,i)=>i===0?{...r,homeGoals:r.homeGoals+1}:r)});
  assert.notEqual(corrected.publication.status,"official");
});
test("clasificación: flags independientes no se activan por guardar tarjetas ni habilitan certificación",()=>{
  const base={NEXT_PUBLIC_SUPABASE_URL:"https://vhryyxplhefmpykumvma.supabase.co",SUPABASE_PHASE4_READ_ENABLED:"true",SUPABASE_PHASE4_WRITE_TARGET:"production",SUPABASE_PHASE4_CARD_WRITES_ENABLED:"true",SUPABASE_PHASE4_PRODUCTION_CARD_WRITES_APPROVED:"true"};
  assert.equal(classificationWritesEnabled(base),false);assert.equal(classificationWritesEnabled({...base,SUPABASE_CLASSIFICATION_WRITES_ENABLED:"true"}),false);
  assert.equal(classificationWritesEnabled({...base,SUPABASE_CLASSIFICATION_WRITES_ENABLED:"true",SUPABASE_CLASSIFICATION_PRODUCTION_WRITES_APPROVED:"true"}),true);
});
test("confirmación: JSONB puede reordenar claves de asignación sin convertir un reintento en conflicto",()=>{
  assert.equal(sameDecisionPayload({team_by_leader_group:{D:"d",B:"b",A:"a",C:"c"}},{team_by_leader_group:{A:"a",B:"b",C:"c",D:"d"}}),true);
  assert.equal(sameDecisionPayload({ordered_team_ids:["a","b"]},{ordered_team_ids:["b","a"]}),false);
});
