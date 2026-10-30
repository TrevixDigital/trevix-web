import test from "node:test";
import assert from "node:assert/strict";
import { teams, groupIds } from "../../src/lib/mundialito/data/teams.ts";
import type { TournamentData } from "../../src/lib/mundialito/domain/types.ts";
import type { CompetitionEvidence } from "../../src/lib/mundialito/domain/governance.ts";
import { calculateTournament } from "../../src/lib/mundialito/engine/tournament.ts";
import { calculateGroup } from "../../src/lib/mundialito/engine/ranking.ts";
import { disciplinePoints } from "../../src/lib/mundialito/engine/discipline.ts";
import { createCompetitionReport, matchInputBasis } from "../../src/lib/mundialito/repositories/competition-report.ts";
import { playerSlug } from "../../src/lib/mundialito/data/players.ts";
import { publishedState } from "../../src/lib/mundialito/domain/publication-state.ts";
import { classificationConfirmationBasis } from "../../src/lib/mundialito/events/classification-decisions.ts";

function completeData(): TournamentData {
  const data: TournamentData={teams,fixtures:[],results:[],players:teams.map(t=>({id:`p-${t.slug}`,slug:playerSlug("Prueba aislada",`p-${t.slug}`),name:"Prueba aislada",teamId:t.slug,shirtNumber:null})),events:[],eventCoverage:[],disciplineCoverage:[],draws:[]};
  const fixtures=[],results=[],events=[];
  for (const [gIndex,group] of groupIds.entries()) {
    const members=teams.filter(t=>t.group===group);
    for (const [i,[a,b]] of [[0,1],[0,2],[1,2]].entries()) {
      const homeTeamId=members[a].slug,awayTeamId=members[b].slug,id=`${group}-${i}`,goals=i===0?gIndex+1:i===1?gIndex+2:1;
      fixtures.push({id,stage:"groups" as const,group,homeTeamId,awayTeamId});
      results.push({matchId:id,homeTeamId,awayTeamId,state:"confirmed" as const,homeGoals:goals,awayGoals:0});
      for(let j=0;j<goals;j++)events.push({id:`${id}-goal-${j}`,matchId:id,teamId:homeTeamId,playerId:`p-${homeTeamId}`,kind:"goal" as const});
    }
  }
  return {...data,fixtures,results,events};
}
function evidence(data:TournamentData):CompetitionEvidence {
  return {reviews:data.results.map(r=>({matchId:r.matchId,basis:matchInputBasis(data,r.matchId),
    goals:{complete:true,documentReference:"Acta sintética",confirmedAt:"2026-10-27T10:00:00Z"},
    cards:{complete:true,documentReference:"Acta sintética sin tarjetas",confirmedAt:"2026-10-27T10:00:00Z"}})),protests:[],protestsComplete:true};
}
function approve(data:TournamentData,e:CompetitionEvidence):CompetitionEvidence {
  return {...e,approval:{id:"resolution-local",scope:"group-classification",basis:createCompetitionReport(data,e).publication.basis,documentReference:"Resolución local publicada",notifiedAt:"2026-10-27T11:00:00Z"}};
}
test("avance deportivo: cuartos resueltos no exigen certificaciones antiguas cuando la clasificación deportiva está confirmada",()=>{
 const d=completeData();const initial=calculateTournament(d);
 for(const id of ["O1","O5"]){const m=initial.bracket.find(m=>m.id===id)!;d.fixtures=[...d.fixtures,{id,stage:"round16",homeTeamId:m.home.teamId,awayTeamId:m.away.teamId}];d.results=[...d.results,{matchId:id,homeTeamId:m.home.teamId!,awayTeamId:m.away.teamId!,state:"confirmed",homeGoals:1,awayGoals:1,penalties:{home:4,away:5}}];}
 d.eventCoverage=[];d.disciplineCoverage=[];
 d.sportingConfirmation={id:"isolated-confirmation",basis:classificationConfirmationBasis(d)};
 const r=createCompetitionReport(d);
 assert.equal(r.publication.status,"official");
 const c=r.operations.find(o=>o.matchId==="C1")!;
 assert.equal(c.canPublishOfficial,true);assert.ok(!c.reasons.includes("previous_acta_pending"));
});

test("operaciones: clasificación matemática conserva candidatos pero exige aprobación antes de publicar llaves",()=>{
  const d=completeData(),e=evidence(d),r=createCompetitionReport(d,e);
  assert.equal(r.operations.filter(o=>o.projection.stage==="round16").every(o=>o.reasons.includes("classification_unapproved")),true);
  const approved=createCompetitionReport(d,approve(d,e));
  assert.equal(approved.operations.filter(o=>o.projection.stage==="round16").every(o=>o.canPublishOfficial),true);
});
test("operaciones: protesta sobre O1 bloquea su cadena y no la rama independiente",()=>{
  const d=completeData(),e={...evidence(d),protests:[{id:"appeal",matchIds:["O1"],affectsGroupClassification:false,status:"open" as const}]};
  // Fixtures exist even when the match has no result or participants persisted.
  d.fixtures=[...d.fixtures,{id:"O1",stage:"round16"}];
  const r=createCompetitionReport(d,approve(d,e));
  for(const id of ["O1","C1","S1","P3","F"])assert.ok(r.operations.find(o=>o.matchId===id)!.reasons.includes("protest_pending"));
  for(const id of ["O2","C2","S2"])assert.ok(!r.operations.find(o=>o.matchId===id)!.reasons.includes("protest_pending"));
  assert.equal(r.calculation.bracket[0].id,"O1"); // mathematical graph remains intact
});
test("operaciones: protesta resuelta sin notificar y registro no verificado siguen bloqueados",()=>{
  const d=completeData();d.fixtures=[...d.fixtures,{id:"O1",stage:"round16"}];
  const e={...evidence(d),protestsComplete:false,protests:[{id:"p",matchIds:["O1"],affectsGroupClassification:false,status:"resolved" as const,resolution:{id:"r",documentReference:"Resolución",notifiedAt:""}}]};
  const r=createCompetitionReport(d,e);
  assert.ok(r.operations.find(o=>o.matchId==="O1")!.reasons.includes("protests_unverified"));
  assert.ok(r.operations.find(o=>o.matchId==="F")!.reasons.includes("protest_pending"));
});
test("publicación: utiliza el motor único, 18 equipos/6 grupos y cuatro terceros sin repetir grupo",()=>{
  const data=completeData(),r=createCompetitionReport(data);
  assert.deepEqual(r.calculation,calculateTournament(data));
  assert.equal(r.calculation.groups.length,6);assert.equal(data.teams.length,18);
  assert.equal(Object.keys(r.calculation.assignment.byGroup).length,4);
  for(const [group,id] of Object.entries(r.calculation.assignment.byGroup)) assert.notEqual(data.teams.find(t=>t.slug===id)!.group,group);
  assert.equal(r.publication.status,"provisional");assert.ok(r.publication.blockers.includes("approval_missing"));
});

test("publicación visible: cálculo resuelto sin aprobación nunca muestra confirmado",()=>{
  const d=completeData(),e=evidence(d),provisional=createCompetitionReport(d,e).publication;
  assert.equal(publishedState("confirmed",provisional),"provisional");
  const official=createCompetitionReport(d,approve(d,e)).publication;
  assert.equal(publishedState("confirmed",official),"confirmed");
  assert.equal(publishedState("confirmed",official,false),"provisional");
  assert.equal(publishedState("pending",official),"pending");
});
test("publicación: certificar todo no aprueba una clasificación, resolución documentada sobre huella actual sí",()=>{
  const d=completeData(),e=evidence(d),r=createCompetitionReport(d,e);
  assert.equal(r.publication.calculationComplete,true);assert.equal(r.publication.status,"provisional");
  assert.deepEqual(r.publication.blockers,["approval_missing"]);
  assert.equal(createCompetitionReport(d,approve(d,e)).publication.status,"official");
});
test("publicación: protesta pendiente o resuelta sin notificación impide oficializar",()=>{
  const d=completeData();
  for(const protest of [{id:"p",matchIds:[d.fixtures[0].id],affectsGroupClassification:true,status:"open" as const},
    {id:"p",matchIds:[d.fixtures[0].id],affectsGroupClassification:true,status:"resolved" as const,resolution:{id:"r",documentReference:"Acta",notifiedAt:""}}]){
    const e={...evidence(d),protests:[protest]};const r=createCompetitionReport(d,approve(d,e));
    assert.equal(r.publication.status,"provisional");assert.ok(r.publication.blockers.includes("protest_pending"));
  }
});
test("publicación: resolución notificada y aprobación específica son hechos separados",()=>{
  const d=completeData(),e={...evidence(d),protests:[{id:"p",matchIds:[d.fixtures[0].id],affectsGroupClassification:true,status:"resolved" as const,resolution:{id:"r",documentReference:"Resolución",notifiedAt:"2026-10-27T10:00:00Z"}}]};
  assert.equal(createCompetitionReport(d,e).publication.status,"provisional");
  assert.equal(createCompetitionReport(d,approve(d,e)).publication.status,"official");
});
test("publicación: marcador corregido invalida evidencia y aprobación, sin mutar entradas",()=>{
  const d=completeData(),e=approve(d,evidence(d)),copy=JSON.stringify(d);
  const changed={...d,results:d.results.map((r,i)=>i===0?{...r,homeGoals:r.homeGoals+1}:r)};
  const report=createCompetitionReport(changed,e);
  assert.equal(report.publication.status,"provisional");assert.ok(report.publication.blockers.includes("approval_stale"));
  assert.ok(report.publication.blockers.includes("certification_pending"));assert.equal(report.evidenceIssues[0].matchId,d.fixtures[0].id);
  assert.equal(JSON.stringify(d),copy);
});
test("publicación: actas parciales no producen ceros disciplinarios certificados",()=>{
  const d=completeData(),e=evidence(d);e.reviews=e.reviews.map((r,i)=>i===0?{...r,cards:{...r.cards,complete:false}}:r);
  const r=createCompetitionReport(d,e),f=d.fixtures[0];
  assert.ok(r.publication.blockers.includes("certification_pending"));
  const home=r.calculation.groups[0].rows.find(t=>t.team.slug===f.homeTeamId)!;
  assert.equal(home.stats.discipline,null);
});
test("publicación: cero eventos/cero-cero permite evidencia completa sin inventar goleadores",()=>{
  const d=completeData(),first=d.results[0];
  const zero={...d,results:d.results.map(r=>r===first?{...r,homeGoals:0,awayGoals:0}:r),events:d.events.filter(e=>e.matchId!==first.matchId)};
  const r=createCompetitionReport(zero,evidence(zero));
  assert.ok(r.calculation.data.eventCoverage.includes(first.matchId));
  assert.equal(r.calculation.data.events.filter(e=>e.matchId===first.matchId).length,0);
});
test("publicación: no puede crear cobertura con referencias falsas, causas pendientes o un resultado live",()=>{
  const d=completeData(),e=evidence(d);e.reviews=e.reviews.map((r,i)=>i===0?{...r,goals:{...r.goals,documentReference:null}}:r);
  assert.ok(!createCompetitionReport(d,e).calculation.data.eventCoverage.includes(d.fixtures[0].id));
  const live={...d,results:d.results.map((r,i)=>i===0?{...r,state:"live" as const}:r)};
  assert.ok(!createCompetitionReport(live,evidence(live)).calculation.data.eventCoverage.includes(d.fixtures[0].id));
  const red={...d,events:[...d.events,{id:"unknown-red",matchId:d.fixtures[0].id,teamId:d.fixtures[0].homeTeamId!,playerId:`p-${d.fixtures[0].homeTeamId}`,kind:"red" as const,disciplineUncertified:true}]};
  assert.ok(!createCompetitionReport(red,evidence(red)).calculation.data.disciplineCoverage.includes(d.fixtures[0].id));
});
test("publicación: registro vacío de protestas sin verificación no acredita que no existan",()=>{
  const d=completeData(),e={...evidence(d),protestsComplete:false};
  const r=createCompetitionReport(d,approve(d,e));
  assert.equal(r.publication.status,"provisional");assert.ok(r.publication.blockers.includes("protests_unverified"));
});
test("publicación: duplicados, ámbito ajeno y booleanos falsificados se rechazan",()=>{
  const d=completeData(),e=evidence(d);
  assert.throws(()=>createCompetitionReport(d,{...e,reviews:[...e.reviews,e.reviews[0]]}));
  assert.throws(()=>createCompetitionReport(d,{...e,reviews:[{...e.reviews[0],matchId:"foreign"}]}));
  assert.throws(()=>createCompetitionReport(d,{...e,reviews:[{...e.reviews[0],goals:{...e.reviews[0].goals,complete:"true" as unknown as boolean}}]}));
  assert.throws(()=>createCompetitionReport(d,{...e,protests:[{id:"foreign",matchIds:["foreign"],affectsGroupClassification:true,status:"open"}]}));
});
test("artículo 11: ejemplo concreto de mini tabla reducida requiere Comité si cambia el orden",()=>{
  const source=completeData(),members=teams.filter(t=>t.group==="A");
  // A-B 2-1, A-C 0-3, B-C 2-0: los tres tienen 3 puntos; B y C igualan DG y GF.
  const scores=[[2,1],[0,3],[2,0]];
  const d: TournamentData={...source,results:source.results.map(r=>r.matchId.startsWith("A-")?{...r,homeGoals:scores[Number(r.matchId.slice(2))][0],awayGoals:scores[Number(r.matchId.slice(2))][1]}:r),events:[],eventCoverage:[],disciplineCoverage:source.fixtures.map(f=>f.id)};
  d.events=[{id:"yellow-B",matchId:"A-0",teamId:members[1].slug,playerId:`p-${members[1].slug}`,kind:"yellow"}] as TournamentData["events"];
  const g=calculateGroup("A",d);
  assert.ok(g.rows.filter(r=>[members[1].slug,members[2].slug].includes(r.team.slug)).every(r=>r.pending.includes("interpretation")));
  assert.equal(calculateGroup("A",{...d,interpretation:{reapplyHeadToHead:true,documentReference:"Hipótesis del Comité, solo prueba"}}).rows[0].team.slug,members[1].slug);
  assert.equal(calculateGroup("A",{...d,interpretation:{reapplyHeadToHead:false,documentReference:"Hipótesis del Comité, solo prueba"}}).rows[0].team.slug,members[2].slug);
});
test("artículo 11: 1/3/4 disciplinarios y amarillo más roja directa 5, sin sumar dos veces",()=>{
  const base={matchId:"m",teamId:"t",playerId:"p"};
  assert.equal(disciplinePoints([{...base,id:"y",kind:"yellow"}]),1);
  assert.equal(disciplinePoints([{...base,id:"y1",kind:"yellow"},{...base,id:"y2",kind:"yellow"},{...base,id:"s",kind:"second-yellow"}]),3);
  assert.equal(disciplinePoints([{...base,id:"r",kind:"red"}]),4);
  assert.equal(disciplinePoints([{...base,id:"y",kind:"yellow"},{...base,id:"r",kind:"red"}]),5);
});
test("publicación: representación estable por orden de lectura y no expone referencias privadas en el token",()=>{
  const d=completeData(),e=evidence(d),r=createCompetitionReport(d,e);
  const reversed={...d,teams:[...d.teams].reverse(),fixtures:[...d.fixtures].reverse(),results:[...d.results].reverse(),events:[...d.events].reverse()};
  const other:CompetitionEvidence={...e,reviews:[...e.reviews].reverse().map(r=>({...r,goals:{...r.goals,documentReference:"Referencia privada corregida"}}))};
  assert.equal(createCompetitionReport(reversed,other).publication.basis,r.publication.basis);
  assert.match(r.publication.basis,/^[a-f0-9]{64}$/);
});
test("artículos 11 y 13: penales y tarjetas de octavos no alteran clasificación ni aprobación de grupos",()=>{
  const d=completeData(),old=approve(d,evidence(d)),before=createCompetitionReport(d,old);
  const o=before.calculation.bracket.find(m=>m.id === "O1")!;
  const home=o.home.teamId!,away=o.away.teamId!;
  const added: TournamentData={...d,fixtures:[...d.fixtures,{id:"O1",stage:"round16",homeTeamId:home,awayTeamId:away}],
    results:[...d.results,{matchId:"O1",homeTeamId:home,awayTeamId:away,state:"confirmed",homeGoals:1,awayGoals:1,penalties:{home:5,away:4}}],
    events:[...d.events,
      {id:"ko-home",matchId:"O1",teamId:home,playerId:`p-${home}`,kind:"goal"},
      {id:"ko-away",matchId:"O1",teamId:away,playerId:`p-${away}`,kind:"goal"},
      {id:"ko-yellow",matchId:"O1",teamId:home,playerId:`p-${home}`,kind:"yellow"},
      ...Array.from({length:5},(_,i)=>({id:`shootout-${i}`,matchId:"O1",teamId:home,playerId:`p-${home}`,kind:"goal" as const,phase:"shootout" as const}))]};
  const report=createCompetitionReport(added,{...evidence(added),approval:old.approval});
  assert.deepEqual(report.calculation.groups,before.calculation.groups);
  assert.equal(report.publication.basis,before.publication.basis);
  assert.equal(report.publication.status,"official");
  assert.equal(report.calculation.bracket.find(m=>m.id === "O1")!.winnerId,home);
  assert.equal(report.calculation.statistics.playerRows.find(p=>p.player.id===`p-${home}`)?.goals,
    (before.calculation.statistics.playerRows.find(p=>p.player.id===`p-${home}`)?.goals??0)+1);
});
