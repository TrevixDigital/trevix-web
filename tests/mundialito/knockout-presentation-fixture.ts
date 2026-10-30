import fs from"node:fs";import{createRequire}from"node:module";import{runInNewContext}from"node:vm";import ts from"typescript";import type React from"react";
import{matchesFixture}from"./matches-presentation-fixture.ts";
import{createCompetitionReport}from"../../src/lib/mundialito/repositories/competition-report.ts";
import type{KnockoutPresentationProps,knockoutPresentation}from"../../src/app/(torneo)/mundialito/eliminatorias/knockout-presentation.tsx";
import{statusLabels}from"../../src/lib/mundialito/matches/model.ts";
export function knockoutFixture():KnockoutPresentationProps{const c=matchesFixture();return{report:createCompetitionReport(c.snapshot.data),calendar:c.calendar};}
export function loadKnockoutViews(){
 const require=createRequire(import.meta.url);
 function compile(file:string,overrides:Record<string,unknown>={}){const exports:Record<string,unknown>={};const code=ts.transpileModule(fs.readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;runInNewContext(code,{exports,Intl,Date,require:(id:string)=>overrides[id]??require(id)});return exports;}
 const dataUI=compile('../../src/components/mundialito/data-ui.tsx');
 const result=compile('../../src/app/(torneo)/mundialito/eliminatorias/knockout-presentation.tsx',{'next/link':{__esModule:true,default:'a'},'@/lib/mundialito/matches/model':{statusLabels},'@/components/mundialito/data-ui':dataUI,'./knockout.module.css':{__esModule:true,default:new Proxy({},{get:(_t,k)=>String(k)})}});
 return result as {KnockoutPresentation:React.ComponentType<KnockoutPresentationProps>;knockoutPresentation:typeof knockoutPresentation};
}
