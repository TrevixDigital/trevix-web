import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as presentation from "../../src/lib/mundialito/admin/history-presentation.ts";
import { auditEntry } from "../../src/lib/mundialito/admin/regulatory-read.ts";
import { uuid } from "./supabase-fixtures.ts";

const team=uuid(100),player=uuid(900),actor=uuid(800);
const names={teams:[{id:team,name:"Sagrado"}],players:[{id:player,fullName:"Juan Pérez"}]};
test("historial: resuelve referencias conocidas sin inventar nombres para IDs desconocidos",()=>{
 assert.equal(presentation.historyChange({field:"team_id",before:null,after:team},names),"Equipo: Sagrado");
 assert.equal(presentation.historyChange({field:"player_id",before:null,after:player},names),"Jugador: Juan Pérez");
 assert.equal(presentation.historyChange({field:"away_team_id",before:null,after:team},names),"Equipo visitante: Sagrado");
 assert.equal(presentation.historyChange({field:"player_id",before:null,after:uuid(901)},names),`Jugador: ID ${uuid(901)}`);
});
test("historial: ceros y falsos se conservan; vacíos redundantes se omiten y retiradas se explican",()=>{
 assert.equal(presentation.historyChange({field:"home_score",before:null,after:0}),"Goles local: 0");
 assert.equal(presentation.historyChange({field:"cards_complete",before:true,after:false}),"Tarjetas revisadas: Sí → No");
 assert.equal(presentation.historyChange({field:"minute",before:null,after:null}),null);
 assert.equal(presentation.historyChange({field:"notes",before:"Revisado",after:null}),"Observaciones: retirado (antes: Revisado)");
});
test("historial: acciones, eventos y estados se presentan en español sin cambiar el registro",()=>{
 assert.equal(presentation.historyHeading({entity:"match_event",action:"INSERT"}),"Evento del partido · Registro creado");
 assert.equal(presentation.historyHeading({entity:"match",action:"UPDATE"}),"Partido · Registro actualizado");
 assert.equal(presentation.historyHeading({entity:"match_review",action:"DELETE"}),"Revisión del acta · Registro eliminado");
 assert.equal(presentation.historyChange({field:"event_type",before:"goal",after:"own_goal"}),"Evento: Gol → Autogol");
 assert.equal(presentation.historyChange({field:"dismissal_cause",before:null,after:"second_yellow"}),"Expulsión: Doble amarilla");
 assert.equal(presentation.historyChange({field:"status",before:"scheduled",after:"finished"}),"Estado: Programado → Finalizado");
});
test("historial: fechas del registro y programación utilizan Guatemala incluso al cambiar de día UTC",()=>{
 const text=presentation.historyDate("2026-10-29T00:43:10Z");assert.match(text,/28\/10\/2026/);assert.match(text,/18:43:10/);
 assert.equal(presentation.historyDate("2026-10-29T00:43:10Z"),presentation.historyDate("2026-10-28T18:43:10-06:00"));
 assert.match(presentation.historyChange({field:"scheduled_at",before:null,after:"2026-10-29T00:43:10Z"})!,/18:43:10/);
 assert.equal(presentation.historyDate(null),"Fecha no disponible");
});
test("historial: muestra cambios de participantes y revisión operativa sin alterar auditoría ni filtrar columnas futuras",()=>{
 const raw={id:uuid(1),actor_id:actor,entity:"match_review",action:"UPDATE",recorded_at:"2026-10-29T00:43:10Z",old_data:{cards_recorded_at:null},new_data:{cards_recorded_at:"2026-10-29T00:43:10Z",internal_future:"privado"}};
 const before=JSON.stringify(raw),entry=auditEntry(raw,true);
 assert.deepEqual(entry.changes,[{field:"cards_recorded_at",before:null,after:"2026-10-29T00:43:10Z"}]);
 assert.equal(JSON.stringify(raw),before);assert.ok(!JSON.stringify(entry).includes("privado"));
 assert.match(presentation.historyChange(entry.changes[0])!,/Revisión operativa de tarjetas/);
});
test("disciplina administrativa: muestra el valor provisional existente, incluido cero, y respeta cobertura pendiente",()=>{
 assert.equal(presentation.groupDisciplineLabel({discipline:null,provisionalDiscipline:0}),"0 puntos (provisional)");
 assert.equal(presentation.groupDisciplineLabel({discipline:null,provisionalDiscipline:1}),"1 punto (provisional)");
 assert.equal(presentation.groupDisciplineLabel({discipline:null}),"Pendiente de revisión de tarjetas");
 assert.equal(presentation.groupDisciplineLabel({discipline:4,provisionalDiscipline:0}),"4 puntos");
});
test("historial renderizado: mantiene el responsable, escapa nombres y evita códigos técnicos y NULL repetidos",()=>{
 const require=createRequire(import.meta.url),exports:Record<string,unknown>={};
 const code=ts.transpileModule(readFileSync(new URL('../../src/app/(torneo)/mundialito/admin/partidos/history-panel.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 runInNewContext(code,{exports,require:(id:string)=>id==='@/lib/mundialito/admin/history-presentation'?presentation:id.endsWith('admin.module.css')?{default:{}}:require(id)});
 const Panel=exports.HistoryPanel as React.ComponentType<Record<string,unknown>>;
 const markup=renderToStaticMarkup(React.createElement(Panel,{entries:[{id:uuid(1),actorId:actor,at:"2026-10-29T00:43:10Z",entity:"match_event",action:"INSERT",changes:[{field:"team_id",before:null,after:team},{field:"player_id",before:null,after:player},{field:"minute",before:null,after:null}]}],error:"",teams:names.teams,players:[{id:player,fullName:'Juan <script>'}]}));
 assert.match(markup,/Sagrado/);assert.match(markup,/Juan &lt;script&gt;/);assert.match(markup,new RegExp(actor));
 assert.doesNotMatch(markup,/INSERT|NULL|sin dato|<script>|Minuto:/);assert.ok(!markup.includes(team)&&!markup.includes(player));
});
test("estadísticas administrativas: cero revisado se muestra provisional y no como pendiente de acta",async()=>{
 const context={data:{teams:[{slug:"sagrado",name:"Sagrado"}],results:[],players:[]},integrity:{issues:[]},competition:{publication:{},operations:[]},snapshot:{groups:[{group:"B",hasResults:true,rows:[{team:{slug:"sagrado",name:"Sagrado"},stats:{points:1,played:1,gf:1,ga:1,gd:0,discipline:null,provisionalDiscipline:0},position:1,pending:[]}]}],thirds:[],statistics:{eventComplete:false,recordedScorers:[],playerRows:[]}}};
 const before=JSON.stringify(context),require=createRequire(import.meta.url),exports:Record<string,unknown>={};
 const deps:Record<string,unknown>={"@/lib/mundialito/admin/history-presentation":presentation,"@/lib/mundialito/admin/server":{requireAdministrator:async()=>({})},"@/lib/mundialito/matches/repository":{readAdminMatches:async()=>context},"../statistics-summary":{PublicationStatus:()=>null},"../admin.module.css":{default:{}},"next/link":{default:({children}:React.PropsWithChildren)=>React.createElement("a",null,children)}};
 const code=ts.transpileModule(readFileSync(new URL('../../src/app/(torneo)/mundialito/admin/estadisticas/page.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 runInNewContext(code,{exports,require:(id:string)=>Object.hasOwn(deps,id)?deps[id]:require(id)});
 const Page=exports.default as ()=>Promise<React.ReactElement>;
 const text=renderToStaticMarkup(await Page()).replace(/<[^>]*>/g,"");
 assert.match(text,/Disciplina: 0 puntos \(provisional\)/);assert.match(text,/Sagrado: 0 puntos \(provisional\)/);
 assert.doesNotMatch(text,/Desempate oficial:|pendiente de actas/);assert.equal(JSON.stringify(context),before);
});
