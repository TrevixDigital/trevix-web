import test from "node:test";
import assert from "node:assert/strict";
import { playerTotals, validateTotals, goalTotals, type SimpleBinding } from "../../src/lib/mundialito/events/simple-acta.ts";
import { operationUuid, saveSimpleActa } from "../../src/lib/mundialito/events/simple-save.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uuid } from "./supabase-fixtures.ts";
const binding: SimpleBinding={
 id:uuid(401),operationId:uuid(9000),version:"2026-10-01T12:00:00Z",phase:"groups",
 values:{scheduled_at:null,venue:null,notes:null,status:"scheduled",home_score:null,away_score:null,home_penalties:null,away_penalties:null},
 teams:[{id:uuid(101),name:"Local"},{id:uuid(102),name:"Visitante"}],
 players:[{id:uuid(901),teamId:uuid(101),tournamentId:uuid(1),fullName:"Jugador local",slug:"jugador-local",shirtNumber:null,position:null,active:true,updatedAt:"2026-10-01T12:00:00Z"}],
 goals:[],cards:{},
};
test("acta sencilla: carga cero sin convertir el marcador NULL en 0",()=>{
 const rows=playerTotals(binding);assert.equal(rows.length,3);assert.equal(rows[0].goals,0);assert.equal(binding.values.home_score,null);
 assert.deepEqual(validateTotals(rows,binding),rows);
});
test("acta sencilla: una cantidad representa tres goles, autogoles acreditan al rival",()=>{
 const rows=playerTotals(binding);rows[0].goals=3;rows[0].ownGoals=1;rows[2].ownGoals=2;
 assert.deepEqual(goalTotals(validateTotals(rows,binding),binding.teams),[5,1]);
});
test("acta sencilla: rechaza nómina adulterada, duplicados y cantidades inválidas",()=>{
 const rows=playerTotals(binding);
 assert.throws(()=>validateTotals(rows.slice(1),binding),/incompleta/);
 assert.throws(()=>validateTotals([rows[0],rows[0],rows[2]],binding),/repetido/);
 for(const n of [-1,0.5,NaN,null,"3",Infinity]) assert.throws(()=>validateTotals([{...rows[0],goals:n},...rows.slice(1)],binding),/enteros/);
 assert.throws(()=>validateTotals([rows[0],{...rows[1],goals:1},rows[2]],binding),/Solo un autogol/);
});
test("acta sencilla: 2 amarillas y roja directa se rechazan; las otras combinaciones se admiten",()=>{
 const rows=playerTotals(binding);
 for(const [yellows,directReds] of [[0,0],[1,0],[2,0],[0,1],[1,1]]) assert.doesNotThrow(()=>validateTotals([{...rows[0],yellows,directReds},...rows.slice(1)],binding));
 assert.throws(()=>validateTotals([{...rows[0],yellows:2,directReds:1},...rows.slice(1)],binding),/requieren revisión/);
});
test("acta sencilla: IDs de reintento estables, diferenciados por jugador y operación",()=>{
 assert.equal(operationUuid("operacion:jugador:gol:0"),operationUuid("operacion:jugador:gol:0"));
 assert.notEqual(operationUuid("operacion:jugador:gol:0"),operationUuid("operacion:jugador:gol:1"));
 assert.match(operationUuid("operacion:jugador:gol:0"),/^[a-f0-9-]{36}$/);
});
test("acta sencilla: un finalizado sin marcador se puede corregir sin recargar y no inicia escrituras",async()=>{
 const client={auth:{getUser:async()=>({data:{user:{id:uuid(800)}},error:null})},rpc:async()=>({data:true,error:null}),from(){throw Error("No debería consultar ni escribir tablas");}} as unknown as SupabaseClient;
 const result=await saveSimpleActa(client,binding,{status:"finished",home_score:"",away_score:"",home_penalties:"",away_penalties:"",totals:playerTotals(binding)});
 assert.match(result.error,/ambos marcadores/);assert.equal(result.retryOnly,false);assert.deepEqual(result.completed,[]);
});

test("acta sencilla: resultado eliminatorio bloqueado antes de guardar tarjetas o goles si el avance seguro está apagado",async(t)=>{
 const old=process.env.SUPABASE_KNOCKOUT_PROGRESS_ENABLED;
 process.env.SUPABASE_KNOCKOUT_PROGRESS_ENABLED="false";
 t.after(()=>{if(old===undefined)delete process.env.SUPABASE_KNOCKOUT_PROGRESS_ENABLED;else process.env.SUPABASE_KNOCKOUT_PROGRESS_ENABLED=old;});
 let tableCalls=0;
 const client={auth:{getUser:async()=>({data:{user:{id:uuid(800)}},error:null})},rpc:async()=>({data:true,error:null}),from(){tableCalls++;throw Error("No iniciar operaciones de tablas");}} as unknown as SupabaseClient;
 const knockout={...binding,phase:"round_of_16"};
 const totals=playerTotals(knockout);totals[0].goals=1;
 const result=await saveSimpleActa(client,knockout,{status:"finished",home_score:"1",away_score:"0",home_penalties:"",away_penalties:"",totals});
 assert.match(result.error,/avance seguro.*desactivado/i);
 assert.deepEqual(result.completed,[]);assert.equal(result.retryOnly,false);assert.equal(tableCalls,0);
});
