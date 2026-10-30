import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { calendarRows } from "./supabase-fixtures.ts";
import { mapSupabaseCalendar } from "../../src/lib/mundialito/adapters/supabase-calendar.ts";
import { calculateTournament } from "../../src/lib/mundialito/engine/tournament.ts";
import { playerSlug } from "../../src/lib/mundialito/data/players.ts";
import type { TournamentData } from "../../src/lib/mundialito/domain/types.ts";
function page(data:TournamentData) {
  const snapshot=calculateTournament(data),require=createRequire(import.meta.url);
  const dependencies:Record<string,unknown>={
    "@/lib/mundialito/repositories/tournament":{getTournament:async()=>snapshot,getCalendarReadMetadata:async()=>null},
    "@/lib/mundialito/matches/model":{statusLabels:{}},
    "@/components/mundialito/hero":{Hero:()=>null},
    "@/components/mundialito/data-ui":{StateBadge:()=>null,PendingNotice:()=>null,DataEmpty:({title,children}:{title:string;children:React.ReactNode})=>React.createElement("p",null,title,children)},
    "next/navigation":{notFound:()=>{throw Error("Not found");}},
    "next/link":{default:({children,...props}:{children:React.ReactNode})=>React.createElement("a",props,children)},
  };
  const exports:Record<string,unknown>={};
  const code=ts.transpileModule(readFileSync(new URL("../../src/app/(torneo)/mundialito/partidos/[id]/page.tsx",import.meta.url),"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020},
  }).outputText;
  runInNewContext(code,{exports,Intl,Date,require:(id:string)=>Object.hasOwn(dependencies,id)?dependencies[id]:require(id)});
  return exports.default as (p:{params:Promise<{id:string}>})=>Promise<React.ReactNode>;
}
test("ficha pública: 0–3 oficial conserva cinco goles individuales, explica corrección y no inventa eventos",async()=>{
  const data=mapSupabaseCalendar(calendarRows()).data,f=data.fixtures[0];
  data.results=[{matchId:f.id,state:"confirmed",homeTeamId:f.homeTeamId!,awayTeamId:f.awayTeamId!,homeGoals:0,awayGoals:3}];
  data.players=[0,1].map(i=>({id:`p${i}`,name:`Jugador existente ${i}`,slug:playerSlug(`Jugador existente ${i}`,`p${i}`),teamId:i?f.awayTeamId!:f.homeTeamId!,shirtNumber:null}));
  data.events=Array.from({length:5},(_,i)=>({id:`g${i}`,matchId:f.id,teamId:i<4?f.homeTeamId!:f.awayTeamId!,playerId:i<4?"p0":"p1",kind:"goal"}));
  const original=JSON.stringify(data),html=renderToStaticMarkup(await page(data)({params:Promise.resolve({id:f.id})}));
  assert.match(html,/Marcador oficial registrado/);assert.match(html,/Una corrección administrativa/);
  assert.match(html,/sin añadir goles a los jugadores/);assert.match(html,/0 – 3/);
  assert.equal((html.match(/class="event-list"/g)??[]).length,1);
  assert.equal((html.match(/<li>/g)??[]).length,5);assert.equal((html.match(/Jugador existente 0/g)??[]).length,4);
  assert.equal(JSON.stringify(data),original);assert.ok(!html.includes("undefined′"));
});
test("ficha pública: pendiente sin resultado mantiene VS y no afirma una corrección existente",async()=>{
  const data=mapSupabaseCalendar(calendarRows()).data,id=data.fixtures[0].id;
  const html=renderToStaticMarkup(await page(data)({params:Promise.resolve({id})}));
  assert.match(html,/>VS</);assert.match(html,/Sin resultado oficial/);assert.ok(!html.includes("Marcador oficial registrado"));
  assert.ok(!html.includes("Una corrección administrativa"));
});
