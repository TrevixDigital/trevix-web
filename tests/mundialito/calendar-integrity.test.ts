import test from "node:test";
import assert from "node:assert/strict";
import { calendarRows } from "./supabase-fixtures.ts";
import { calendarIntegrity, matchIntegrity, storedScoreLabel } from "../../src/lib/mundialito/matches/integrity.ts";
import { mapSupabaseCalendar } from "../../src/lib/mundialito/adapters/supabase-calendar.ts";
import { createCompetitionReport } from "../../src/lib/mundialito/repositories/competition-report.ts";
test("integridad: scheduled 0–0 es dato real pendiente, NULL sigue vacío y ninguno suma puntos",()=>{
  const rows=calendarRows(),first={...rows.matches[0],home_score:0,away_score:0};
  assert.equal(storedScoreLabel(first),"0 – 0");assert.equal(matchIntegrity(first)[0].code,"SCHEDULED_SCORE");
  assert.match(storedScoreLabel(rows.matches[1]),/NULL/);
  const r=createCompetitionReport(mapSupabaseCalendar({...rows,matches:[first,...rows.matches.slice(1)]}).data);
  assert.equal(r.calculation.data.results.length,0);assert.equal(r.calculation.groups[0].rows.every(r=>r.stats.points===0),true);
});
test("integridad: advierte marcador parcial, finalizado incompleto y tanda inválida sin corregir",()=>{
  const row=calendarRows().matches[0],copy=JSON.stringify(row);
  assert.ok(matchIntegrity({...row,home_score:1}).some(i=>i.code==="PARTIAL_SCORE"));
  assert.ok(matchIntegrity({...row,status:"finished"}).some(i=>i.code==="FINISHED_WITHOUT_SCORE"));
  assert.ok(matchIntegrity({...row,status:"finished",home_score:1,away_score:1,home_penalties:5,away_penalties:4}).some(i=>i.code==="INVALID_PENALTIES"));
  assert.equal(JSON.stringify(row),copy);
});
test("integridad: O7 2A–2D y O8 2B–2C; cruces distintos se señalan",()=>{
  const rows=calendarRows();
  for(const n of [25,26])assert.deepEqual(matchIntegrity(rows.matches.find(r=>r.match_number===n)!),[]);
  assert.ok(matchIntegrity({...rows.matches[24],away_source:"2C"}).some(i=>i.code==="BRACKET_SOURCE"));
});
test("integridad: referencias WIN/LOSE genéricas no se declaran verificadas",()=>{
  assert.ok(matchIntegrity(calendarRows().matches[26]).some(i=>i.code==="GENERIC_SOURCE"));
});
test("integridad: números duplicados o faltantes y códigos incompatibles se detectan",()=>{
  const rows=calendarRows();assert.ok(calendarIntegrity({...rows,matches:rows.matches.slice(1)}).issues.some(i=>i.code==="CALENDAR_COUNT"));
  assert.ok(matchIntegrity({...rows.matches[24],bracket_code:"O8"}).some(i=>i.code==="BRACKET_CODE"));
});
