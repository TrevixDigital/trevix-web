import test from "node:test";import assert from "node:assert/strict";import React from "react";import{renderToStaticMarkup}from"react-dom/server";
import{loadGroupViews,syntheticGroupsReport}from"./groups-presentation-fixture.ts";
const{GroupTables,ThirdsStandings}=loadGroupViews();
const rows=(html:string)=>[...html.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)].flatMap(m=>[...m[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(r=>[...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(c=>c[1].replace(/<[^>]*>/g,""))));
test("grupos: los seis grupos conservan tres equipos y diez celdas alineadas",()=>{
 const report=syntheticGroupsReport(),before=JSON.stringify(report),html=renderToStaticMarkup(React.createElement(GroupTables,{report}));
 assert.equal((html.match(/<table/g)??[]).length,6);assert.equal(rows(html).length,18);assert.ok(rows(html).every(r=>r.length===10));
 for(const group of report.calculation.groups)for(const row of group.rows)assert.ok(html.includes(row.team.name));
 assert.equal(JSON.stringify(report),before);
});
test("terceros parciales: el equipo queda en EQUIPO, no en PJ ni en un colspan estadístico",()=>{
 const report=syntheticGroupsReport(2),html=renderToStaticMarkup(React.createElement(ThirdsStandings,{report})),body=rows(html);
 assert.equal(report.calculation.thirds.length,0);assert.equal(body.length,6);assert.ok(body.every(r=>r.length===10));assert.ok(!html.includes("colSpan")&&!html.includes("colspan"));
 const third=report.calculation.groups[0].rows.find(r=>r.position===3)!;
 assert.equal(body[0][1],third.team.name);assert.equal(body[0][2],"A");assert.equal(body[0][3],String(third.stats.played));assert.equal(body[0][0],"—");
 assert.equal(body[2][1],"Por definir");assert.equal(body[2][3],"—");assert.ok(!html.includes(">Clasificado<"));
});
test("terceros resueltos: identidad de tercero, estadísticas, disciplina cero y orden provienen del motor",()=>{
 const report=syntheticGroupsReport(),before=JSON.stringify(report),body=rows(renderToStaticMarkup(React.createElement(ThirdsStandings,{report})));
 assert.equal(report.calculation.thirds.length,6);
 report.calculation.thirds.forEach((r,i)=>{
  assert.equal(report.calculation.groups.find(g=>g.group===r.team.group)!.rows.find(t=>t.position===3)!.team.slug,r.team.slug);
  assert.deepEqual(body[i].slice(0,6),[String(r.position),r.team.name,r.team.group,String(r.stats.played),String(r.stats.gf),String(r.stats.ga)]);
  assert.equal(body[i][7],String(r.stats.points));assert.equal(body[i][8],"0");
 });assert.equal(JSON.stringify(report),before);
});
test("terceros: sorteo no resuelto conserva guion de posición y aviso sin publicar clasificados",()=>{
 const report=syntheticGroupsReport();report.calculation.thirds=report.calculation.thirds.map(r=>({...r,position:null,possiblePositions:[1,2,3,4,5,6],pending:["draw"]}));
 const html=renderToStaticMarkup(React.createElement(ThirdsStandings,{report}));assert.ok(rows(html).every(r=>r[0]==="—"));assert.match(html,/Sorteo documentado requerido/);assert.ok(!html.includes(">Clasificado<"));
});
test("grupos sin resultados no inventan posiciones ni marcadores y no repiten avisos por jugador",()=>{
 const report=syntheticGroupsReport(0),html=renderToStaticMarkup(React.createElement(GroupTables,{report}));
 assert.ok(rows(html).every(r=>r[0]==="—"&&r[2]==="—"));assert.ok(!html.includes("Clasificación pendiente"));
});
