import test from "node:test";
import assert from "node:assert/strict";
import { disciplinaryObligations } from "../../src/lib/mundialito/engine/disciplinary-obligations.ts";
import { mapSupabaseCalendar } from "../../src/lib/mundialito/adapters/supabase-calendar.ts";
import { calendarRows } from "./supabase-fixtures.ts";
import { playerSlug } from "../../src/lib/mundialito/data/players.ts";
import type { TournamentData,MatchEvent } from "../../src/lib/mundialito/domain/types.ts";
function fixture(kinds:MatchEvent["kind"][]):TournamentData {
  const data=mapSupabaseCalendar(calendarRows()).data,f=data.fixtures[0];
  return {...data,players:[{id:"p",name:"Caso sintético",teamId:f.homeTeamId!,slug:playerSlug("Caso sintético","p"),shirtNumber:null}],
    results:[{matchId:f.id,homeTeamId:f.homeTeamId!,awayTeamId:f.awayTeamId!,homeGoals:0,awayGoals:0,state:"confirmed"}],
    disciplineCoverage:[f.id],events:kinds.map((kind,i)=>({id:`e${i}`,kind,matchId:f.id,teamId:f.homeTeamId!,playerId:"p"}))};
}
test("obligaciones: amarilla Q10/1 punto; doble amarilla Q20 total/3 puntos y un partido",()=>{
  for(const [kinds,amount,points,suspension] of [[["yellow"],10,1,null],[["yellow","yellow","second-yellow"],20,3,1]] as const){
    const d=fixture([...kinds]),before=JSON.stringify(d),o=disciplinaryObligations(d)[0];
    assert.equal(o.totalQuetzales,amount);assert.equal(o.points,points);assert.equal(o.suspensionMatches,suspension);assert.equal(o.paymentStatus,"not-recorded");assert.equal(JSON.stringify(d),before);
  }
});
test("obligaciones: roja directa y agresión esperan calificación; nunca expulsión definitiva automática",()=>{
  const d=fixture(["red"]);
  assert.equal(disciplinaryObligations(d)[0].totalQuetzales,null);
  const q={eventId:"e0",kind:"without-aggression" as const,documentReference:"Acta local"};
  assert.equal(disciplinaryObligations(d,[q])[0].totalQuetzales,30);assert.equal(disciplinaryObligations(d,[q])[0].suspensionMatches,1);
  const aggression=disciplinaryObligations(d,[{...q,kind:"aggression-pending"}])[0];
  assert.equal(aggression.totalQuetzales,null);assert.equal(aggression.suspensionMatches,null);assert.equal(aggression.requiresCommittee,true);
});
test("obligaciones: amarilla y roja calificada conservan componentes distintos, 5 puntos",()=>{
  const o=disciplinaryObligations(fixture(["yellow","red"]),[{eventId:"e1",kind:"without-aggression",documentReference:"Resolución"}])[0];
  assert.equal(o.totalQuetzales,40);assert.equal(o.points,5);assert.deepEqual(o.fineComponents.map(c=>c.quetzales),[10,30]);
});
test("obligaciones: sin certificación, eventos en vivo o sin tarjetas no se generan multas definitivas",()=>{
  const d=fixture(["yellow","yellow"]);d.disciplineCoverage=[];
  assert.equal(disciplinaryObligations(d)[0].totalQuetzales,null);assert.equal(disciplinaryObligations(d)[0].suspensionMatches,null);
  assert.deepEqual(disciplinaryObligations({...d,results:d.results.map(r=>({...r,state:"live"}))}),[]);
  assert.deepEqual(disciplinaryObligations(fixture([])),[]);
});
