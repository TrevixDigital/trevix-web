import test from"node:test";import assert from"node:assert/strict";import React from"react";import{renderToStaticMarkup}from"react-dom/server";
import{loadMatchesViews,matchesFixture}from"./matches-presentation-fixture.ts";
const{CalendarPresentation,MatchRows,matchPresentation}=loadMatchesViews();
test("partidos: conserva última jornada oficial, próxima programada y control existente de calendario",()=>{
 const c=matchesFixture(),before=JSON.stringify(c),html=renderToStaticMarkup(React.createElement(CalendarPresentation,c));
 assert.match(html,/Última fecha/);assert.match(html,/Próxima/);assert.match(html,/Ver calendario completo/);assert.match(html,/Cancha La Bomba/);
 assert.equal((html.match(/<summary/g)??[]).length,1);assert.equal((html.match(/<button/g)??[]).length,0);assert.equal(JSON.stringify(c),before);
});
test("partidos programados: 0–0 almacenado nunca se convierte en marcador oficial",()=>{
 const c=matchesFixture(),m=c.calendar.next!.matches[0],view=matchPresentation(m,c.snapshot);
 assert.equal(view.result,undefined);assert.equal(view.time.replace(/\s+/g," "),"9:00 a. m.");
 const html=renderToStaticMarkup(React.createElement(MatchRows,{matches:[m],snapshot:c.snapshot}));
 assert.match(html,/>VS</);assert.doesNotMatch(html,/Marcador del partido/);assert.match(html,/31\/10\/2026/);
});
test("horarios: conversión Guatemala cruza la fecha UTC correctamente y NULL no inventa horario",()=>{
 const c=matchesFixture(),m={...c.calendar.next!.matches[0],startsAt:"2026-11-01T00:30:00Z"};
 const view=matchPresentation(m,c.snapshot);assert.equal(view.date,"31/10/2026");assert.match(view.time,/6:30/);
 const unknown=matchPresentation({...m,startsAt:null},c.snapshot);assert.equal(unknown.date,null);assert.equal(unknown.time,"Hora por confirmar");
});
test("estados sin resultados: no se deduce que estén finalizados por tener fecha pasada",()=>{
 const c=matchesFixture(),m=c.calendar.next!.matches[0];
 for(const status of ["live","postponed","cancelled","suspended"] as const){const view=matchPresentation({...m,status},c.snapshot);assert.equal(view.result,undefined);assert.ok(view.status.length>0);}
});
test("eliminatorias sin equipos: muestra referencias originales, no participantes proyectados",()=>{
 const c=matchesFixture(),f=c.snapshot.data.fixtures.find(f=>f.id==="O1")!,bracket=c.snapshot.bracket.find(b=>b.id==="O1")!;
 bracket.home.teamId=c.snapshot.data.teams[0].slug;
 const view=matchPresentation({id:f.id,number:19,status:"scheduled",startsAt:null},c.snapshot);
 assert.equal(view.home,bracket.home.label);assert.equal(view.result,undefined);
});
test("penales: el marcador de tanda se presenta separado del resultado del partido",()=>{
 const c=matchesFixture(),m=c.calendar.last!.matches[0];c.snapshot.data={...c.snapshot.data,results:c.snapshot.data.results.map(r=>({...r,homeGoals:1,awayGoals:1,penalties:{home:5,away:4}}))};
 const html=renderToStaticMarkup(React.createElement(MatchRows,{matches:[m],snapshot:c.snapshot}));assert.match(html,/Pen\. 5–4/);assert.doesNotMatch(html,/6–5/);
});
test("calendario vacío: mantiene estados informativos sin fechas, marcadores ni equipos inventados",()=>{
 const c=matchesFixture(),html=renderToStaticMarkup(React.createElement(CalendarPresentation,{...c,calendar:{days:[],last:null,next:null}}));
 assert.match(html,/Sin resultados oficiales publicados/);assert.match(html,/Sin próxima fecha programada/);assert.doesNotMatch(html,/data-match-id=/);
});
