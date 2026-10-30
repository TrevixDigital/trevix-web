import test from "node:test";
import assert from "node:assert/strict";
import { knockoutOutcome,bracketDefinitions } from "../../src/lib/mundialito/engine/bracket.ts";
import { assertKnockoutDatabaseReady,assertKnockoutResultWriteEnabled,knockoutProgressionEnabled } from "../../src/lib/mundialito/matches/progression.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminFetch } from "../../src/lib/mundialito/admin/transport.ts";
import { uuid } from "./supabase-fixtures.ts";
import type { MatchValues } from "../../src/lib/mundialito/matches/model.ts";

test("avance: protege cambios de resultado y penales sin bloquear horarios o estadísticas con resultado intacto",()=>{
 const before:MatchValues={status:"scheduled",home_score:null,away_score:null,home_penalties:null,away_penalties:null,scheduled_at:null,venue:null,notes:null};
 const disabled={SUPABASE_KNOCKOUT_PROGRESS_ENABLED:"false"};
 const patches:Partial<MatchValues>[]=[{status:"live"},{home_score:1},{away_score:0},{home_penalties:4},{away_penalties:5}];
 for(const patch of patches)
  assert.throws(()=>assertKnockoutResultWriteEnabled("round_of_16",before,{...before,...patch},disabled),/avance seguro.*desactivado/i);
 assert.doesNotThrow(()=>assertKnockoutResultWriteEnabled("groups",before,{...before,status:"finished",home_score:1,away_score:0},disabled));
 assert.doesNotThrow(()=>assertKnockoutResultWriteEnabled("quarterfinals",before,{...before,scheduled_at:"2026-11-01T18:00:00Z"},disabled));
 assert.doesNotThrow(()=>assertKnockoutResultWriteEnabled("final",before,{...before},disabled));
 const approved={NEXT_PUBLIC_SUPABASE_URL:"https://vhryyxplhefmpykumvma.supabase.co",SUPABASE_PHASE4_READ_ENABLED:"true",SUPABASE_PHASE4_WRITE_TARGET:"production",SUPABASE_KNOCKOUT_PROGRESS_ENABLED:"true",SUPABASE_KNOCKOUT_PRODUCTION_WRITES_APPROVED:"true"};
 assert.doesNotThrow(()=>assertKnockoutResultWriteEnabled("final",before,{...before,status:"finished",home_score:1,away_score:0},approved));
});

test("avance: ganador normal, penales separados, empate sin ganador y perdedor",()=>{
 assert.deepEqual(knockoutOutcome("home","away",3,1),{winnerId:"home",loserId:"away"});
 assert.deepEqual(knockoutOutcome("home","away",1,1,{home:4,away:5}),{winnerId:"away",loserId:"home"});
 assert.deepEqual(knockoutOutcome("home","away",0,0),{winnerId:undefined,loserId:undefined});
 assert.deepEqual(knockoutOutcome("home","away",1,1,{home:4,away:4}),{winnerId:undefined,loserId:undefined});
});
test("avance: conserva cruces fijos y envía perdedores de semifinales a tercer lugar",()=>{
 for(const[id,home,away]of[["O7","2:A","2:D"],["O8","2:B","2:C"],["C1","W:O1","W:O5"],["C2","W:O2","W:O6"],["C3","W:O3","W:O7"],["C4","W:O4","W:O8"],["S1","W:C1","W:C3"],["S2","W:C2","W:C4"],["P3","L:S1","L:S2"],["F","W:S1","W:S2"]]){
  const b=bracketDefinitions.find(b=>b.id===id)!;assert.equal(b.home,home);assert.equal(b.away,away);
 }
});
test("avance: independiente de certificación, tarjetas cero y publicación de octavos; producción apagada por defecto",()=>{
 const prod={NEXT_PUBLIC_SUPABASE_URL:"https://vhryyxplhefmpykumvma.supabase.co",SUPABASE_PHASE4_READ_ENABLED:"true",SUPABASE_PHASE4_WRITE_TARGET:"production"};
 assert.equal(knockoutProgressionEnabled(prod),false);
 assert.equal(knockoutProgressionEnabled({...prod,SUPABASE_KNOCKOUT_PROGRESS_ENABLED:"true"}),false);
 assert.equal(knockoutProgressionEnabled({...prod,SUPABASE_KNOCKOUT_PROGRESS_ENABLED:"true",SUPABASE_KNOCKOUT_PRODUCTION_WRITES_APPROVED:"true"}),true);
 assert.equal(knockoutProgressionEnabled({...prod,SUPABASE_PHASE4_WRITE_TARGET:"isolated",NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:1234",SUPABASE_PHASE4_ISOLATED_URL:"http://127.0.0.1:1234",SUPABASE_KNOCKOUT_PROGRESS_ENABLED:"true"}),true);
});
test("avance: transporte rechaza RPC nueva mientras no esté autorizada",async()=>{
 let calls=0;const f=adminFetch("https://isolated.example.test",async()=>{calls++;return Response.json({});});
 await assert.rejects(f("https://isolated.example.test/rest/v1/rpc/mundialito_save_knockout",{method:"POST",body:JSON.stringify({p_match_id:uuid(419),p_expected_version:"2026-10-28T00:00:00Z",p_values:{}})}),/no permitida/);assert.equal(calls,0);
});
test("avance: exige versión 2 y activación explícita en base antes de guardar secciones",async()=>{
 for(const reply of [{error:{code:"42883"},data:null},{error:null,data:{version:1,progression_enabled:true}},{error:null,data:{version:2,progression_enabled:false}},{error:null,data:{version:2,progression_enabled:null}}]){
  const client={rpc:async(name:string,_args:unknown,options:unknown)=>{assert.equal(name,"mundialito_knockout_status");assert.deepEqual(options,{get:true});return reply;}} as unknown as SupabaseClient;
  await assert.rejects(assertKnockoutDatabaseReady(client),/desactivado/);
 }
 await assertKnockoutDatabaseReady({rpc:async()=>({error:null,data:{version:2,progression_enabled:true,octavos_enabled:false}})} as unknown as SupabaseClient);
});
test("avance: transporte no admite asignación alternativa PATCH de participantes",async()=>{
 let calls=0;const f=adminFetch("https://isolated.example.test",async()=>{calls++;return Response.json({});});
 await assert.rejects(f("https://isolated.example.test/rest/v1/matches?id=eq."+uuid(419),{method:"PATCH",body:JSON.stringify({home_team_id:uuid(101),away_team_id:uuid(102)})}),/no permitida/);
 assert.equal(calls,0);
});
test("avance: asignación atómica de octavos tiene autorización independiente",async()=>{
 let calls=0;const f=adminFetch("https://isolated.example.test",async()=>{calls++;return Response.json({});});
 await assert.rejects(f("https://isolated.example.test/rest/v1/rpc/mundialito_assign_octavos",{method:"POST",body:JSON.stringify({p_group_basis:"a".repeat(64),p_plan:Array.from({length:8},(_,i)=>({id:uuid(419+i),home:uuid(101+i*2),away:uuid(102+i*2),version:"2026-10-28T00:00:00Z"}))})}),/no permitida/);
 assert.equal(calls,0);
});
