import test from "node:test";
import assert from "node:assert/strict";
import { mapSupabaseCalendar } from "../../src/lib/mundialito/adapters/supabase-calendar.ts";
import { calendarRows,uuid } from "./supabase-fixtures.ts";
import { createCompetitionReport } from "../../src/lib/mundialito/repositories/competition-report.ts";
import { recordedCardRegistration, type CardEvent } from "../../src/lib/mundialito/events/cards.ts";
import type { TournamentData } from "../../src/lib/mundialito/domain/types.ts";
function groupB() {
  const rows=calendarRows();Object.assign(rows.matches[3],{status:"finished",home_score:1,away_score:1});
  const data:TournamentData=mapSupabaseCalendar(rows).data;
  const match=data.fixtures[3],home=match.homeTeamId!,away=match.awayTeamId!;
  data.players=[{id:"san-julian-player",name:"Jugador de prueba",slug:"prueba--san-julian-player",teamId:home,shirtNumber:null}];
  data.events=[{id:"yellow-b",matchId:match.id,teamId:home,playerId:"san-julian-player",kind:"yellow",disciplineUncertified:true}];
  data.provisionalDisciplineCoverage=[{matchId:match.id,teamId:home}];
  return {data,match,home,away};
}
test("cero tarjetas: San Julián 1 y ausencia de eventos de Sagrado no prueban cero ni resuelven el empate",()=>{
  const {data}=groupB(),group=createCompetitionReport(data).calculation.groups[1];
  assert.ok(group.rows.slice(0,2).every(r=>r.position===null&&r.pending.includes("discipline")));
});
test("cero tarjetas: con constancia válida de cero el motor común ordena Sagrado primero sin certificar",()=>{
  const {data,match,away}=groupB();
  // Synthetic trusted completeness evidence, NOT inferred from event absence and
  // never persisted to production. The missing real persistence is documented.
  data.provisionalDisciplineCoverage=[...data.provisionalDisciplineCoverage!,{matchId:match.id,teamId:away}];
  const report=createCompetitionReport(data),group=report.calculation.groups[1];
  assert.equal(group.rows[0].team.slug,"sagrado");assert.equal(group.rows[0].position,1);assert.equal(group.rows[0].stats.provisionalDiscipline,0);
  assert.equal(group.rows[1].team.slug,"san-julian");assert.equal(group.rows[1].position,2);assert.equal(group.rows[1].stats.provisionalDiscipline,1);
  assert.equal(report.publication.status,"provisional");assert.deepEqual(data.disciplineCoverage,[]);
});
test("registro disciplinario: distingue ausencia, amarilla simple y roja ambigua en lugar de producir cero",()=>{
  const card:CardEvent={id:uuid(900),tournament_id:uuid(1),match_id:uuid(401),team_id:uuid(100),player_id:uuid(910),event_type:"yellow_card",dismissal_cause:null,minute:null,notes:null,created_at:"2026-10-27T12:00:00Z",updated_at:"2026-10-27T12:00:00Z"};
  assert.equal(recordedCardRegistration([]),"zero_unconfirmed");assert.equal(recordedCardRegistration([card]),"recorded");
  assert.equal(recordedCardRegistration([{...card,event_type:"red_card"}]),"inconsistent");
  assert.equal(recordedCardRegistration([{...card,event_type:"red_card",dismissal_cause:"direct"}]),"recorded");
  const two=[card,{...card,id:uuid(901)}];assert.equal(recordedCardRegistration(two),"inconsistent");
  assert.equal(recordedCardRegistration([...two,{...card,id:uuid(902),event_type:"red_card",dismissal_cause:"second_yellow"}]),"recorded");
});
