import fs from "node:fs";import{createRequire}from"node:module";import{runInNewContext}from"node:vm";import ts from"typescript";import type React from"react";
import {calendarRows,uuid}from"./supabase-fixtures.ts";
import{mapSupabaseCalendar}from"../../src/lib/mundialito/adapters/supabase-calendar.ts";
import{calculateTournament}from"../../src/lib/mundialito/engine/tournament.ts";
import{selectCalendar}from"../../src/lib/mundialito/calendar.ts";
import{statusLabels}from"../../src/lib/mundialito/matches/model.ts";
import type{CalendarPresentationProps,matchPresentation}from"../../src/app/(torneo)/mundialito/partidos/calendar-presentation.tsx";
export function matchesFixture(){
 const rows=calendarRows();rows.matchdays[0]={...rows.matchdays[0],scheduled_date:"2026-10-24"};
 rows.matches[0]={...rows.matches[0],status:"finished",home_score:3,away_score:3,scheduled_at:"2026-10-24T15:00:00Z",venue:"Cancha La Bomba"};
 rows.matchdays.push({...rows.matchdays[0],id:uuid(699),number:6,scheduled_date:"2026-10-31"});
 rows.matches[1]={...rows.matches[1],matchday_id:uuid(699),scheduled_at:"2026-10-31T15:00:00Z",home_score:0,away_score:0};
 const mapped=mapSupabaseCalendar(rows);return {snapshot:calculateTournament(mapped.data),calendar:selectCalendar(mapped.data,mapped.metadata,new Date("2026-10-28T18:00:00Z"))};
}
export function loadMatchesViews(){
 const require=createRequire(import.meta.url),exports:Record<string,unknown>={};
 const code=ts.transpileModule(fs.readFileSync(new URL('../../src/app/(torneo)/mundialito/partidos/calendar-presentation.tsx',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 runInNewContext(code,{exports,Intl,Date,require:(id:string)=>id==="next/link"?{__esModule:true,default:"a"}:id==="@/lib/mundialito/matches/model"?{statusLabels}:id==="./matches.module.css"?{__esModule:true,default:new Proxy({},{get:(_t,k)=>String(k)})}:require(id)});
 return exports as {CalendarPresentation:React.ComponentType<CalendarPresentationProps>;MatchRows:React.ComponentType<{matches:CalendarPresentationProps['calendar']['days'][number]['matches'];snapshot:CalendarPresentationProps['snapshot']}>;matchPresentation:typeof matchPresentation};
}
