import test from "node:test";
import assert from "node:assert/strict";
import { summarizeActa } from "../../src/lib/mundialito/events/acta-summary.ts";
import { observedDisciplineSummary,disciplinePoints } from "../../src/lib/mundialito/engine/discipline.ts";
import { uuid } from "./supabase-fixtures.ts";
import type { OfficialEvent } from "../../src/lib/mundialito/events/model.ts";
import type { MatchEvent } from "../../src/lib/mundialito/domain/types.ts";
import { phase4Capabilities } from "../../src/lib/mundialito/events/capabilities.ts";
const row={id:uuid(401),status:"finished",home_team_id:uuid(100),away_team_id:uuid(101),home_score:2,away_score:1};
const event=(id:number,team:string,event_type:OfficialEvent["event_type"],player:string|null=uuid(900)):OfficialEvent=>({id:uuid(id),tournament_id:uuid(1),match_id:uuid(401),team_id:team,player_id:player,event_type,minute:null,notes:null,created_at:"2026-10-27T10:00:00Z",updated_at:"2026-10-27T10:00:00Z"});
test("acta: autogol se acredita al rival, autor NULL es válido y coincidencia no certifica",()=>{
  const events=[event(1,uuid(100),"goal"),event(2,uuid(101),"own_goal",null),event(3,uuid(101),"goal"),event(4,uuid(100),"yellow_card")];
  const summary=summarizeActa(row,events);
  assert.equal(summary.homeGoals,2);assert.equal(summary.awayGoals,1);assert.equal(summary.coherent,true);assert.equal(summary.yellows,1);
  assert.match(summary.message,/independiente/);assert.ok(!Object.hasOwn(summary,"certified"));
});
test("acta: NULL no equivale a cero y un marcador sin eventos expone diferencias",()=>{
  assert.equal(summarizeActa({...row,home_score:null,away_score:null},[]).hasScore,false);
  const missing=summarizeActa(row,[]);assert.equal(missing.coherent,false);assert.equal(missing.canReview,false);assert.match(missing.message,/2–1/);
});
test("acta: cero goles y cero tarjetas pueden revisarse solo con estado/participantes válidos",()=>{
  assert.equal(summarizeActa({...row,home_score:0,away_score:0},[]).canReview,true);
  assert.equal(summarizeActa({...row,status:"scheduled",home_score:0,away_score:0},[]).canReview,false);
  assert.equal(summarizeActa({...row,home_team_id:null,home_score:0,away_score:0},[]).canReview,false);
});
test("acta: correcciones recalculan diferencias sin mutar marcador y excluyen otros partidos",()=>{
  const before=JSON.stringify(row),goal=event(1,uuid(100),"goal");
  assert.equal(summarizeActa(row,[goal,{...goal,id:uuid(2),match_id:uuid(402)}]).homeGoals,1);
  assert.equal(JSON.stringify(row),before);
});
const card=(kind:MatchEvent["kind"],id:string,extra:Partial<MatchEvent>={}):MatchEvent=>({id,kind,matchId:"synthetic",teamId:"synthetic-team",playerId:"synthetic-player",disciplineUncertified:true,...extra});
test("disciplina observada: 1/3/4/5 sin convertir observaciones en puntos oficiales",()=>{
  for(const [events,expected] of [
    [[card("yellow","y")],1],
    [[card("yellow","y1"),card("yellow","y2"),card("second-yellow","r",{dismissalCause:"second_yellow"})],3],
    [[card("red","r",{dismissalCause:"direct"})],4],
    [[card("yellow","y"),card("red","r",{dismissalCause:"direct"})],5],
  ] as [MatchEvent[],number][]) {
    const copy=JSON.stringify(events);assert.equal(observedDisciplineSummary(events).points,expected);
    assert.equal(disciplinePoints(events),null);assert.equal(JSON.stringify(events),copy);
  }
});
test("disciplina observada: roja sin causa y registro incompatible conservan puntos pendientes",()=>{
  assert.equal(observedDisciplineSummary([card("red","r")]).points,null);
  assert.equal(observedDisciplineSummary([card("yellow","y1"),card("yellow","y2"),card("red","r",{dismissalCause:"direct"})]).points,null);
});

test("acta: preparar activación de tarjetas no activa certificación ni acepta host diferente",()=>{
  const approved={NEXT_PUBLIC_SUPABASE_URL:"https://vhryyxplhefmpykumvma.supabase.co",SUPABASE_PHASE4_READ_ENABLED:"true",SUPABASE_PHASE4_WRITE_TARGET:"production",
    SUPABASE_PHASE4_CARD_WRITES_ENABLED:"true",SUPABASE_PHASE4_PRODUCTION_CARD_WRITES_APPROVED:"true",SUPABASE_PHASE4_CERTIFICATION_WRITES_ENABLED:"true"};
  assert.equal(phase4Capabilities(approved).cardsWrite,true);assert.equal(phase4Capabilities(approved).certificationWrite,false);
  for(const key of ["SUPABASE_PHASE4_READ_ENABLED","SUPABASE_PHASE4_CARD_WRITES_ENABLED","SUPABASE_PHASE4_PRODUCTION_CARD_WRITES_APPROVED"])
    assert.equal(phase4Capabilities({...approved,[key]:"false"}).cardsWrite,false);
  for(const url of ["https://another.supabase.co","http://vhryyxplhefmpykumvma.supabase.co","https://user@vhryyxplhefmpykumvma.supabase.co","https://vhryyxplhefmpykumvma.supabase.co/path"])
    assert.equal(phase4Capabilities({...approved,NEXT_PUBLIC_SUPABASE_URL:url}).cardsWrite,false);
  assert.equal(phase4Capabilities({...approved,SUPABASE_PHASE4_WRITE_TARGET:"isolated",SUPABASE_PHASE4_ISOLATED_URL:approved.NEXT_PUBLIC_SUPABASE_URL}).cardsWrite,false);
});
