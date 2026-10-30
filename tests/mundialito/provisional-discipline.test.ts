import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { calendarRows, uuid } from "./supabase-fixtures.ts";
import { mapSupabaseCalendar } from "../../src/lib/mundialito/adapters/supabase-calendar.ts";
import { readCardSnapshot } from "../../src/lib/mundialito/events/card-read.ts";
import { createCompetitionReport } from "../../src/lib/mundialito/repositories/competition-report.ts";
import type { CardEvent } from "../../src/lib/mundialito/events/cards.ts";
import type { TournamentData, MatchEvent } from "../../src/lib/mundialito/domain/types.ts";
import { calculateStats } from "../../src/lib/mundialito/engine/ranking.ts";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { qualification } from "../../src/lib/mundialito/engine/tournament.ts";
import { teams } from "../../src/lib/mundialito/data/teams.ts";
import { loadProfileViews } from "./team-profile-presentation-fixture.ts";

function fixture() {
  const rows=calendarRows(),cards:CardEvent[]=[];
  let serial=10000;
  const finish=(i:number,home=3,away=3)=>{Object.assign(rows.matches[i],{status:"finished",home_score:home,away_score:away});};
  function card(i:number,side:"home"|"away",type:"yellow_card"|"red_card"="yellow_card",cause:CardEvent["dismissal_cause"]=null,playerId?:string) {
    const m=rows.matches[i],id=uuid(serial++);
    cards.push({id,tournament_id:uuid(1),match_id:m.id as string,team_id:m[`${side}_team_id`] as string,player_id:playerId??uuid(serial++),event_type:type,dismissal_cause:cause,minute:null,notes:null,created_at:"2026-10-27T12:00:00Z",updated_at:"2026-10-27T12:00:00Z"});
    return cards.at(-1)!;
  }
  async function report(stale=false) {
    const snapshot=mapSupabaseCalendar(rows);
    const view=snapshot.metadata.matches.map(m=>({match_id:m.id,tournament_id:uuid(1),status:m.status,phase:m.phase,home_team_id:m.homeTeamId,away_team_id:m.awayTeamId,
      home_score:rows.matches.find(r=>r.id===m.id)!.home_score,away_score:rows.matches.find(r=>r.id===m.id)!.away_score,cards_complete:false,events:cards.filter(e=>e.match_id===m.id)}));
    if(stale)view[0].home_score=99;
    const client=createClient("https://synthetic.example.test","sb_publishable_synthetic",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async()=>new Response(JSON.stringify(view),{headers:{"Content-Type":"application/json","Content-Range":`0-${view.length-1}/${view.length}`}})}});
    const read=await readCardSnapshot(client,snapshot);
    const mapped:MatchEvent[]=read.events.map(e=>({id:e.id,matchId:snapshot.metadata.matches.find(m=>m.id===e.match_id)!.localId,teamId:snapshot.metadata.teams.find(t=>t.id===e.team_id)!.localSlug,playerId:e.player_id,
      kind:e.event_type==="yellow_card"?"yellow":e.dismissal_cause==="second_yellow"?"second-yellow":"red",disciplineUncertified:true,...(e.dismissal_cause?{dismissalCause:e.dismissal_cause}:{})}));
    const data:TournamentData={...snapshot.data,events:mapped,players:[...new Map(mapped.map(e=>[e.playerId!,{id:e.playerId!,name:e.playerId!,slug:`jugador--${e.playerId}`,teamId:e.teamId,shirtNumber:null}])).values()],
      disciplineCoverage:read.coverage,provisionalDisciplineCoverage:read.provisionalCoverage};
    return createCompetitionReport(data);
  }
  return {rows,cards,finish,card,report};
}
test("provisional: 3–3, La Bomba cuatro amarillas y Villa Hermosa dos; orden 2/1 sin certificación",async()=>{
  const f=fixture();f.finish(0);for(let i=0;i<4;i++)f.card(0,"home");for(let i=0;i<2;i++)f.card(0,"away");
  const r=await f.report(),g=r.calculation.groups[0];
  assert.equal(g.rows[0].team.slug,"villa-hermosa");assert.equal(g.rows[0].position,1);assert.equal(g.rows[0].stats.provisionalDiscipline,2);
  assert.equal(g.rows[1].team.slug,"la-bomba");assert.equal(g.rows[1].position,2);assert.equal(g.rows[1].stats.provisionalDiscipline,4);
  assert.equal(g.rows[0].stats.discipline,null);assert.deepEqual(r.calculation.data.disciplineCoverage,[]);assert.equal(r.publication.status,"provisional");
  assert.ok(!g.rows.some(row=>row.pending.includes("discipline")));
});
test("provisional: doble amarilla vale tres en total; roja directa cuatro y amarilla más roja cinco",async()=>{
  for(const [yellows,cause,expected] of [[2,"second_yellow",3],[0,"direct",4],[1,"direct",5]] as const) {
    const f=fixture();f.finish(0);const player=uuid(8800);
    for(let i=0;i<yellows;i++)f.card(0,"home","yellow_card",null,player);
    f.card(0,"home","red_card",cause,player);f.card(0,"away");f.card(0,"away");
    const g=(await f.report()).calculation.groups[0];assert.equal(g.rows[0].team.slug,"villa-hermosa");assert.equal(g.rows[1].stats.provisionalDiscipline,expected);
  }
});
test("provisional: disciplina igual exige sorteo documentado, nunca orden alfabético",async()=>{
  const f=fixture();f.finish(0);f.card(0,"home");f.card(0,"away");
  const g=(await f.report()).calculation.groups[0];assert.ok(g.rows.slice(0,2).every(r=>r.position===null&&r.pending.includes("draw")));
  const r=await f.report(),resolved=createCompetitionReport({...r.calculation.data,draws:[{context:"group:A",orderedTeamIds:["villa-hermosa","la-bomba"],documentReference:"Acta sintética de sorteo"}]});
  assert.equal(resolved.calculation.groups[0].rows[0].team.slug,"villa-hermosa");assert.equal(resolved.calculation.groups[0].rows[0].position,1);
});
test("provisional: tarjetas ausentes, causa desconocida, expulsión incompleta o lectura desactualizada no equivalen a cero",async()=>{
  for(const mode of ["missing","unknown","second-missing","stale"] as const) {
    const f=fixture();f.finish(0);f.card(0,"home");
    if(mode==="unknown")f.card(0,"away","red_card");
    if(mode==="second-missing") {f.card(0,"away","yellow_card",null,uuid(8800));f.card(0,"away","yellow_card",null,uuid(8800));}
    if(mode==="stale")f.card(0,"away");
    const g=(await f.report(mode==="stale")).calculation.groups[0];assert.ok(g.rows.slice(0,2).every(r=>r.position===null&&r.pending.includes("discipline")),mode);
  }
});
test("provisional: el mismo desempate funciona en los seis grupos",async()=>{
  const f=fixture();for(let group=0;group<6;group++){f.finish(group*3);f.card(group*3,"home");f.card(group*3,"home");f.card(group*3,"away");}
  const r=await f.report();for(const g of r.calculation.groups){assert.equal(g.rows[0].stats.provisionalDiscipline,1);assert.equal(g.rows[1].stats.provisionalDiscipline,2);}
});
test("provisional: mini tabla de tres igualados continúa con disciplina registrada",async()=>{
  const f=fixture();for(let i=0;i<3;i++){f.finish(i,0,0);f.card(i,"home");f.card(i,"away");}
  f.card(1,"away");f.card(2,"away");f.card(2,"home");
  const g=(await f.report()).calculation.groups[0];assert.deepEqual(g.rows.map(r=>r.stats.provisionalDiscipline),[2,3,4]);assert.deepEqual(g.rows.map(r=>r.position),[1,2,3]);
});
test("provisional: mejores terceros usan disciplina de grupos sin duelo directo ni tarjetas eliminatorias",async()=>{
  const f=fixture();for(let group=0;group<6;group++) {
    const base=group*3;f.finish(base,1,0);f.finish(base+1,2,0);f.finish(base+2,1,0);
    for(let i=base;i<base+3;i++){f.card(i,"home");for(let j=0;j<group+1;j++)f.card(i,"away");}
  }
  const r=await f.report();assert.equal(r.calculation.thirds.length,6);
  assert.deepEqual(r.calculation.thirds.map(t=>t.stats.provisionalDiscipline),[2,4,6,8,10,12]);
  assert.deepEqual(r.calculation.thirds.map(t=>t.position),[1,2,3,4,5,6]);assert.equal(r.publication.status,"provisional");
  assert.ok(r.publication.blockers.includes("certification_pending"));
  const team=r.calculation.thirds[0].team,opponent=r.calculation.thirds[1].team;
  const extra:TournamentData={...r.calculation.data,fixtures:[...r.calculation.data.fixtures,{id:"knockout-test",stage:"final",homeTeamId:team.slug,awayTeamId:opponent.slug}],
    results:[...r.calculation.data.results,{matchId:"knockout-test",state:"confirmed",homeTeamId:team.slug,awayTeamId:opponent.slug,homeGoals:1,awayGoals:0}],
    events:[...r.calculation.data.events,{id:"red-knockout",matchId:"knockout-test",teamId:team.slug,playerId:r.calculation.data.players.find(p=>p.teamId===team.slug)!.id,kind:"red",dismissalCause:"direct",disciplineUncertified:true}]};
  assert.deepEqual(calculateStats(team,extra),calculateStats(team,r.calculation.data));
});

test("provisional: tabla pública y perfiles existentes muestran las mismas posiciones sin declararlas oficiales",async()=>{
  const f=fixture();f.finish(0);for(let i=0;i<4;i++)f.card(0,"home");for(let i=0;i<2;i++)f.card(0,"away");
  const report=await f.report(),require=createRequire(import.meta.url);
  const dependencies:Record<string,unknown>={
    "./team-profile":{TeamProfile:loadProfileViews().TeamProfile},
    "@/lib/mundialito/repositories/tournament":{getCompetitionReport:async()=>report,getCalendar:async()=>({days:[]}),tournamentRepository:{}},
    "@/lib/mundialito/engine/tournament":{qualification},"@/lib/mundialito/data/teams":{teams},
    "@/lib/mundialito/players/public":{getPublicTeamRoster:async()=>[]},"@/lib/mundialito/players/model":{positions:{},publicPlayerSlug:()=>""},
    "@/components/mundialito/hero":{Hero:()=>null},"@/components/mundialito/match-list":{MatchList:()=>null},
    "@/components/mundialito/data-ui":{StatGrid:({items}:{items:{label:string;value:unknown}[]})=>React.createElement("dl",null,items.map(i=>React.createElement("div",{key:i.label},React.createElement("dt",null,i.label),React.createElement("dd",null,String(i.value))))),PendingNotice:()=>null,DataEmpty:()=>null,StateBadge:()=>null},
    "next/navigation":{notFound(){throw Error("Not found");}},"next/link":{default:({children,...props}:React.PropsWithChildren<Record<string,unknown>>)=>React.createElement("a",props,children)},
  };
  function load(file:string) {
    const exports:Record<string,unknown>={};
    const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
    runInNewContext(code,{exports,Intl,Date,require:(id:string)=>Object.hasOwn(dependencies,id)?dependencies[id]:require(id)});return exports;
  }
  const Groups=load("../../src/components/mundialito/groups.tsx").Groups as ()=>Promise<React.ReactNode>;
  const html=renderToStaticMarkup(await Groups()),groupA=html.slice(0,html.indexOf('id="grupo-b"'));
  assert.ok(groupA.indexOf("Villa Hermosa")<groupA.indexOf("La Bomba"));
  const Page=load("../../src/app/(torneo)/mundialito/equipos/[slug]/page.tsx").default as (p:{params:Promise<{slug:string}>})=>Promise<React.ReactNode>;
  for(const [slug,position] of [["villa-hermosa",1],["la-bomba",2]] as const) {
    const profile=renderToStaticMarkup(await Page({params:Promise.resolve({slug})}));
    const positionBlock=profile.match(/data-profile-stat="Posición"[^>]*>([\s\S]*?)<\/div>/)?.[1]??"";
    assert.ok(positionBlock.includes(`<dd>${position}</dd>`));assert.ok(profile.includes("Clasificación provisional"));assert.ok(!profile.includes("Clasificado confirmado"));
  }
});
