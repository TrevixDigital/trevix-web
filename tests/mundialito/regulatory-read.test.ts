import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { adminFetch } from "../../src/lib/mundialito/admin/transport.ts";
import { auditEntry, readDecisionRegister, readMatchHistory } from "../../src/lib/mundialito/admin/regulatory-read.ts";
import { uuid } from "./supabase-fixtures.ts";
const tournament=uuid(1),match=uuid(2),actor=uuid(3),id=uuid(4);
function fixture() {
  let permission:unknown=true,user=true,errorTable="";
  const requests:{table:string;url:URL;method:string}[]=[];
  const tables:Record<string,unknown[]>={
    tournaments:[{id:tournament}],matches:[{id:match}],
    match_audit_log:[{id,match_id:match,changed_by:actor,action:"UPDATE",old_data:{home_score:null},new_data:{home_score:0,updated_at:"2026-10-27T10:00:00Z"}}],
    regulatory_audit_log:[],mundialito_decisions:[],
  };
  const client=createClient("https://isolated.example.test","sb_publishable_fixture",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:adminFetch("https://isolated.example.test",async(input,init)=>{
    const url=new URL(String(input)),table=url.pathname.split("/").at(-1)!;
    requests.push({table,url,method:init?.method??"GET"});
    if(table==="is_mundialito_admin")return Response.json(permission);
    if(table===errorTable)return Response.json({code:"42501"},{status:403});
    const rows=tables[table];if(!rows)throw Error("Unexpected table");
    if((init?.headers as Record<string,string>)?.accept?.includes("object"))return Response.json(rows[0]);
    // PostgREST .single() uses Accept, which Headers normalizes.
    if(new Headers(init?.headers).get("accept")?.includes("object"))return Response.json(rows[0]);
    return Response.json(rows,{headers:{"content-range":`0-${Math.max(rows.length-1,0)}/${rows.length}`}});
  })}});
  client.auth.getUser=async()=>({data:{user:user?{id:actor}:null},error:null}) as unknown as Awaited<ReturnType<typeof client.auth.getUser>>;
  return {client,tables,requests,permission:(p:unknown)=>{permission=p;},user:(u:boolean)=>{user=u;},fail:(t:string)=>{errorTable=t;}};
}
test("historial: visitante y permiso false/NULL no llegan a consultas privadas",async()=>{
  for(const p of [false,null]){const f=fixture();f.permission(p);await assert.rejects(readMatchHistory(f.client,tournament,match),/autorización/);assert.ok(!f.requests.some(r=>r.table==="match_audit_log"));}
  const f=fixture();f.user(false);await assert.rejects(readDecisionRegister(f.client,tournament),/autorización/);assert.equal(f.requests.length,0);
});
test("historial: UID, valores anteriores/nuevos y NULL se conservan; consulta delimitada y solo GET",async()=>{
  const f=fixture(),result=await readMatchHistory(f.client,tournament,match);
  assert.equal(result[0].actorId,actor);assert.deepEqual(result[0].changes,[{field:"home_score",before:null,after:0}]);
  assert.ok(f.requests.every(r=>r.method==="GET"));
  assert.equal(f.requests.find(r=>r.table==="regulatory_audit_log")!.url.searchParams.get("tournament_id"),`eq.${tournament}`);
  assert.equal(f.requests.find(r=>r.table==="match_audit_log")!.url.searchParams.get("match_id"),`eq.${match}`);
});
test("historial: un error RLS no se transforma en historial vacío",async()=>{
  const f=fixture();f.fail("regulatory_audit_log");await assert.rejects(readMatchHistory(f.client,tournament,match),/historial completo/);
});
test("historial: torneo o partido ajenos se rechazan antes de leer auditoría",async()=>{
  const f=fixture();await assert.rejects(readMatchHistory(f.client,uuid(999),match),/torneo oficial/);assert.ok(!f.requests.some(r=>r.table.includes("audit")));
});
test("auditoría: no propaga columnas privadas futuras en diferencias",()=>{
  const r=auditEntry({id,actor_id:actor,recorded_at:"2026-10-27T10:00:00Z",entity:"match_event",action:"UPDATE",old_data:{minute:null,internal_future:"sensitive"},new_data:{minute:22,internal_future:"changed"}},true);
  assert.deepEqual(r.changes,[{field:"minute",before:null,after:22}]);assert.ok(!JSON.stringify(r).includes("sensitive"));
});
test("decisiones: lectura no aplica payloads ni supone resolución de protestas",async()=>{
  const f=fixture();f.tables.mundialito_decisions=[{id,tournament_id:tournament,match_id:match,player_id:null,kind:"protest",scope_key:"match",reason:"Revisión",article_reference:"30",document_reference:"Acta",recorded_by:actor,recorded_at:"2026-10-27T10:00:00Z",supersedes_id:null}];
  const rows=await readDecisionRegister(f.client,tournament);assert.equal(rows[0].current,true);
  const select=f.requests.find(r=>r.table==="mundialito_decisions")!.url.searchParams.get("select");assert.ok(!select!.includes("payload"));assert.ok(!select!.includes("*"));
});
test("transporte: nuevas lecturas no permiten escribir decisiones ni auditorías",async()=>{
  const fetch=adminFetch("https://isolated.example.test",async()=>{throw Error("Should not reach network");});
  for(const table of ["mundialito_decisions","regulatory_audit_log"])await assert.rejects(fetch(`https://isolated.example.test/rest/v1/${table}`,{method:"POST",body:"{}"}),/no permitida/);
});
