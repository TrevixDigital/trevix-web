import test from "node:test";
import assert from "node:assert/strict";
import { createClient, AuthSessionMissingError } from "@supabase/supabase-js";
import { cardRegistrationCapabilities,registrationSnapshot,registerReviewedCards } from "../../src/lib/mundialito/events/card-registration.ts";
import { adminFetch } from "../../src/lib/mundialito/admin/transport.ts";
import { uuid } from "./supabase-fixtures.ts";
import type { CardEvent } from "../../src/lib/mundialito/events/cards.ts";
import { mapSupabaseCalendar } from "../../src/lib/mundialito/adapters/supabase-calendar.ts";
import { calendarRows } from "./supabase-fixtures.ts";
import { readCardSnapshot } from "../../src/lib/mundialito/events/card-read.ts";
const scope={id:uuid(401),tournamentId:uuid(1),home:uuid(100),away:uuid(101),groupId:uuid(10),phase:"groups"};
const values={status:"finished" as const,home_score:1,away_score:1,home_penalties:null,away_penalties:null,scheduled_at:null,venue:null,notes:null};
function card(id=uuid(900)):CardEvent{return {id,tournament_id:scope.tournamentId,match_id:scope.id,team_id:scope.home,player_id:uuid(950),event_type:"yellow_card",dismissal_cause:null,minute:10,notes:"No publicar",created_at:"2026-10-27T12:00:00Z",updated_at:"2026-10-27T12:00:00Z"};}
test("registro operativo: flags separados requieren autorización existente de tarjetas, no activan certificado ni octavos",()=>{
 const base={NEXT_PUBLIC_SUPABASE_URL:"https://vhryyxplhefmpykumvma.supabase.co",SUPABASE_PHASE4_READ_ENABLED:"true",SUPABASE_PHASE4_WRITE_TARGET:"production",SUPABASE_PHASE4_CARD_WRITES_ENABLED:"true",SUPABASE_PHASE4_PRODUCTION_CARD_WRITES_APPROVED:"true"};
 assert.deepEqual(cardRegistrationCapabilities(base),{read:false,write:false});
 assert.deepEqual(cardRegistrationCapabilities({...base,SUPABASE_CARD_REGISTRATION_READ_ENABLED:"true"}),{read:true,write:false});
 assert.deepEqual(cardRegistrationCapabilities({...base,SUPABASE_CARD_REGISTRATION_READ_ENABLED:"true",SUPABASE_CARD_REGISTRATION_WRITES_ENABLED:"true"}),{read:true,write:true});
 assert.equal(cardRegistrationCapabilities({...base,SUPABASE_CARD_REGISTRATION_READ_ENABLED:"true",SUPABASE_CARD_REGISTRATION_WRITES_ENABLED:"true",SUPABASE_PHASE4_PRODUCTION_CARD_WRITES_APPROVED:"false"}).write,false);
});
test("registro operativo: fotografía explícita de cero y tarjetas canónicas sin notas, minutos ni administradores",()=>{
 const a=card(uuid(901)),b=card(uuid(900)),snapshot=registrationSnapshot(scope,values,[a,b]);
 assert.deepEqual(snapshot.cards.map(c=>c.id),[b.id,a.id]);assert.deepEqual(registrationSnapshot(scope,values,[]).cards,[]);
 assert.ok(!JSON.stringify(snapshot).includes("No publicar"));assert.ok(!Object.hasOwn(snapshot.cards[0],"minute"));assert.equal(a.minute,10);
 assert.throws(()=>registrationSnapshot(scope,values,[{...a,match_id:uuid(999)}]),/fuera/);
});
test("registro operativo: rechaza visitante antes de llamar RPC y no interpreta una respuesta incierta como éxito",async()=>{
 let calls=0;const client=createClient("https://synthetic.example.test","sb_publishable_synthetic",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async()=>{calls++;throw Error("No network expected");}}});
 client.auth.getUser=async()=>({data:{user:null},error:new AuthSessionMissingError()});
 await assert.rejects(registerReviewedCards(client,registrationSnapshot(scope,values,[])),/administrativa/);assert.equal(calls,0);
});
test("registro operativo: el transporte bloquea la RPC nueva si sus flags están apagados",async()=>{
 let calls=0;const f=adminFetch("https://synthetic.example.test",async()=>{calls++;return Response.json({});});
 await assert.rejects(f("https://synthetic.example.test/rest/v1/rpc/mundialito_register_match_cards",{method:"POST",body:JSON.stringify({p_match_id:scope.id,p_expected:registrationSnapshot(scope,values,[])})}),/no permitida/);
 assert.equal(calls,0);
});
test("registro operativo: una bandera pública vigente permite cero provisional, nunca cobertura certificada ni fallback ante columna ausente",async()=>{
 const keys=["SUPABASE_PHASE4_READ_ENABLED","SUPABASE_CARD_REGISTRATION_READ_ENABLED"],old=keys.map(k=>process.env[k]);
 try {
  for(const key of keys)process.env[key]="true";
  const rows=calendarRows();Object.assign(rows.matches[0],{status:"finished",home_score:0,away_score:0});const snapshot=mapSupabaseCalendar(rows);
  let includeColumn=true,registered=true;
  const client=createClient("https://synthetic.example.test","sb_publishable_synthetic",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async()=>{
    const view=snapshot.metadata.matches.map(m=>({match_id:m.id,tournament_id:snapshot.metadata.tournament.id,status:m.status,phase:m.phase,home_team_id:m.homeTeamId,away_team_id:m.awayTeamId,
      home_score:m.matchNumber===1?0:null,away_score:m.matchNumber===1?0:null,cards_complete:false,events:[],...(includeColumn?{cards_registered:m.matchNumber===1&&registered}:{})}));
    return Response.json(view,{headers:{"content-range":`0-${view.length-1}/${view.length}`}});
  }}});
  const read=await readCardSnapshot(client,snapshot);assert.equal(read.provisionalCoverage.length,2);assert.deepEqual(read.coverage,[]);assert.deepEqual(read.events,[]);
  registered=false;assert.equal((await readCardSnapshot(client,snapshot)).provisionalCoverage.length,0);
  includeColumn=false;await assert.rejects(readCardSnapshot(client,snapshot),/Fotografía/);
 }finally{keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});}
});
