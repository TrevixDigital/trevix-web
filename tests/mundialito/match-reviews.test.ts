import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { phase4Capabilities, requirePhase4Write } from "../../src/lib/mundialito/events/capabilities.ts";
import { readMatchReview, certifyMatchReview, parseReview, parseCertificationSnapshot, loadCertificationSnapshot } from "../../src/lib/mundialito/events/reviews.ts";
import { adminFetch } from "../../src/lib/mundialito/admin/transport.ts";
import { readonlyFetch } from "../../src/lib/mundialito/supabase/readonly-fetch.ts";
import { uuid } from "./supabase-fixtures.ts";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const origin = "https://isolated.example.test";
const scope = { tournamentId: uuid(1), matchId: uuid(401) };
const existing = { match_id: scope.matchId, tournament_id: scope.tournamentId, goals_complete: false, cards_complete: false,
  goals_reference: "Acta previa", cards_reference: null, goals_confirmed_at: null, cards_confirmed_at: null,
  administrative_decision_id: null, updated_at: "2026-10-27T15:00:00Z" };
function configure(t: TestContext, overrides: Record<string, string> = {}) {
  const env = { NEXT_PUBLIC_SUPABASE_URL: origin, SUPABASE_PHASE4_ISOLATED_URL: origin, SUPABASE_PHASE4_WRITE_TARGET: "isolated",
    SUPABASE_PHASE4_READ_ENABLED: "true", SUPABASE_PHASE4_CARD_WRITES_ENABLED: "false", SUPABASE_PHASE4_CERTIFICATION_WRITES_ENABLED: "true", ...overrides };
  const old = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  Object.assign(process.env, env);
  t.after(() => { for (const [k,v] of Object.entries(old)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
}
function harness(options: { user?: boolean; admin?: unknown; row?: unknown; readError?: string; rpcError?: string; rpcData?: unknown; tournament?: string } = {}) {
  const calls: { name: string; args?: Record<string, unknown> }[] = [];
  const filters: [string, unknown][] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: options.user === false ? null : { id: uuid(800) } }, error: null }) },
    from(name: string) {
      calls.push({ name });
      return { select() { return this; }, eq(k: string,v: unknown) { filters.push([k,v]); return this; },
        single: async () => ({ data: { id: options.tournament ?? scope.tournamentId }, error: null }),
        maybeSingle: async () => ({ data: options.row ?? null, error: options.readError ? { code: options.readError } : null }) };
    },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "is_mundialito_admin") return { data: Object.hasOwn(options, "admin") ? options.admin : true, error: null };
      if (options.rpcError) return { data: null, error: { code: options.rpcError, message: "PRIVATE SQL DETAIL MUST NOT LEAK" } };
      return { data: options.rpcData ?? { ...existing, goals_complete: args.p_goals_complete, cards_complete: args.p_cards_complete,
        goals_reference: args.p_goals_reference, cards_reference: args.p_cards_reference,
        goals_confirmed_at: args.p_goals_complete ? existing.updated_at : null,
        cards_confirmed_at: args.p_cards_complete ? existing.updated_at : null }, error: null };
    },
  } as unknown as SupabaseClient;
  return { client, calls, filters };
}
const raw = { basis: "a".repeat(64), goals: true, cards: true, goalsReference: " Acta oficial 1 ", cardsReference: "Acta oficial 1" };

test("capacidades: legado habilita solo lectura; escrituras independientes y cerradas por defecto", () => {
  assert.deepEqual(phase4Capabilities({}), { read: false, cardsWrite: false, certificationWrite: false, isolated: false });
  assert.equal(phase4Capabilities({ SUPABASE_PHASE4_CARDS_ENABLED: "true" }).cardsWrite, false);
  assert.equal(phase4Capabilities({ SUPABASE_PHASE4_CARDS_ENABLED: "true" }).read, true);
  assert.equal(phase4Capabilities({ SUPABASE_PHASE4_CARDS_ENABLED: "true", SUPABASE_PHASE4_READ_ENABLED: "false" }).read, false);
});
test("capacidades: producción permanece bloqueada incluso con todos los flags encendidos", t => {
  configure(t, { NEXT_PUBLIC_SUPABASE_URL: "https://vhryyxplhefmpykumvma.supabase.co", SUPABASE_PHASE4_ISOLATED_URL: "https://vhryyxplhefmpykumvma.supabase.co", SUPABASE_PHASE4_CARD_WRITES_ENABLED: "true" });
  assert.equal(phase4Capabilities().certificationWrite, false);
  assert.throws(() => requirePhase4Write("cards"));
  assert.throws(() => requirePhase4Write("certification"));
});
test("capacidades: certificar no habilita tarjetas, URL distinta o HTTP remoto bloquean", t => {
  configure(t);
  assert.equal(phase4Capabilities().certificationWrite, true);
  assert.equal(phase4Capabilities().cardsWrite, false);
  assert.throws(() => requirePhase4Write("certification", "https://other.example.test"));
  assert.equal(phase4Capabilities({ ...process.env, NEXT_PUBLIC_SUPABASE_URL: "http://remote.test", SUPABASE_PHASE4_ISOLATED_URL: "http://remote.test" }).isolated, false);
});
test("actas: visitante, sesión sin admin, NULL y torneo ajeno se rechazan antes de leer actas", async t => {
  configure(t);
  for (const options of [{ user: false }, { admin: false }, { admin: null }, { tournament: uuid(999) }]) {
    const h=harness(options);
    await assert.rejects(() => readMatchReview(h.client, scope));
    assert.equal(h.calls.some(c => c.name === "match_event_reviews"), false);
    await assert.rejects(() => certifyMatchReview(h.client, scope, null, raw, true));
    assert.equal(h.calls.some(c => c.name === "mundialito_certify_match_events_v2"), false);
  }
});
test("actas: lectura cerrada detecta estructura mediante vista pública sin consultar referencias privadas", async t => {
  configure(t, { SUPABASE_PHASE4_READ_ENABLED: "false" });
  const h=harness(); const result=await readMatchReview(h.client, scope);
  assert.equal(result.available,true); assert.equal(result.readEnabled,false);
  assert.equal(h.calls.some(c => c.name === "match_event_reviews"),false);
  assert.ok(h.calls.some(c => c.name === "mundialito_public_reviews"));
});
test("actas: ausencia de fila es pendiente, ausencia de esquema no es certificación, RLS/error no se ocultan", async t => {
  configure(t); assert.equal((await readMatchReview(harness().client,scope)).review,null);
  assert.equal((await readMatchReview(harness({readError:"PGRST205"}).client,scope)).available,false);
  await assert.rejects(() => readMatchReview(harness({readError:"42501"}).client,scope), /sesión/);
  const h=harness(); await readMatchReview(h.client,scope);
  assert.ok(h.filters.some(([k,v]) => k === "tournament_id" && v === scope.tournamentId));
  assert.ok(h.filters.some(([k,v]) => k === "match_id" && v === scope.matchId));
});
test("actas: primera certificación cero eventos envía versión NULL y no inserta goles ni modifica marcador", async t => {
  configure(t); const h=harness(); const result=await certifyMatchReview(h.client,scope,null,raw,true);
  assert.ok(result.goals_complete && result.cards_complete);
  const writes=h.calls.filter(c => c.name === "mundialito_certify_match_events_v2"); assert.equal(writes.length,1);
  assert.equal(writes[0].args?.p_expected_updated_at,null);
  assert.equal(writes[0].args?.p_goals_reference,"Acta oficial 1");
  assert.ok(h.calls.every(c => !["matches","match_events"].includes(c.name)));
});
test("actas: preserva resolución existente y estados independientes, no acepta resolución falsificada del formulario", async t => {
  configure(t); const h=harness({row:{...existing,administrative_decision_id:uuid(2000)}});
  const result=await certifyMatchReview(h.client,scope,existing.updated_at,{...raw,cards:false,administrative_decision_id:uuid(999)},true);
  assert.equal(result.cards_complete,false);
  assert.equal(h.calls.find(c=>c.name === "mundialito_certify_match_events_v2")?.args?.p_administrative_decision_id,uuid(2000));
});
test("actas: revisión corregida concurrentemente obliga a recargar, no intenta certificar", async t => {
  configure(t);const h=harness({row:{...existing,updated_at:"2026-10-27T15:01:00Z"}});
  await assert.rejects(()=>certifyMatchReview(h.client,scope,existing.updated_at,raw,true),/cambió o fue invalidada/);
  assert.ok(!h.calls.some(c=>c.name === "mundialito_certify_match_events_v2"));
});
test("actas: flags de escritura cerrados bloquean llamadas directas aun con admin válido", async t => {
  configure(t,{SUPABASE_PHASE4_CERTIFICATION_WRITES_ENABLED:"false"});const h=harness();
  await assert.rejects(()=>certifyMatchReview(h.client,scope,null,raw,true),/desactivada/);
  assert.ok(!h.calls.some(c=>c.name === "mundialito_certify_match_events_v2"));
});
test("actas: confirmación, referencias, tipos y errores de RPC; nunca fallback ni reintento automático", async t => {
  configure(t);
  for(const [values,confirmed] of [[raw,false],[{...raw,goalsReference:""},true],[{...raw,cardsReference:"x".repeat(1001)},true],[{...raw,goals:"true"},true]] as const){
    const h=harness();await assert.rejects(()=>certifyMatchReview(h.client,scope,null,values,confirmed));
    assert.ok(!h.calls.some(c=>c.name === "mundialito_certify_match_events_v2"));
  }
  for(const code of ["40001","42501","PGRST202"]){const h=harness({rpcError:code});
    await assert.rejects(()=>certifyMatchReview(h.client,scope,null,raw,true),e=>e instanceof Error && e.message.includes(code) && !e.message.includes("PRIVATE SQL"));
    assert.equal(h.calls.filter(c=>c.name === "mundialito_certify_match_events_v2").length,1);
  }
});
test("actas: respuesta inválida o de otro encuentro no se anuncia como éxito", () => {
  assert.throws(()=>parseReview({...existing,match_id:uuid(999)},scope));
  assert.throws(()=>parseReview({...existing,goals_complete:true},scope));
  assert.equal(parseReview(existing,scope).cards_complete,false);
});
test("fotografía v2: cero eventos válido, huella obligatoria, evento ajeno o repetido rechazado", () => {
  const snapshot={basis:"a".repeat(64),match:{id:scope.matchId,tournament_id:scope.tournamentId,status:"finished",home_team_id:uuid(100),away_team_id:uuid(101),home_score:0,away_score:0,home_penalties:null,away_penalties:null,updated_at:existing.updated_at},review:null,events:[]};
  assert.equal(parseCertificationSnapshot(snapshot,scope).events.length,0);
  assert.throws(()=>parseCertificationSnapshot({...snapshot,basis:null},scope));
  const event={id:uuid(900),match_id:scope.matchId,tournament_id:scope.tournamentId,team_id:uuid(100),player_id:uuid(900),event_type:"yellow_card",minute:null,notes:null,dismissal_cause:null,updated_at:existing.updated_at};
  assert.equal(parseCertificationSnapshot({...snapshot,events:[event]},scope).events.length,1);
  assert.throws(()=>parseCertificationSnapshot({...snapshot,events:[event,event]},scope));
  assert.throws(()=>parseCertificationSnapshot({...snapshot,events:[{...event,match_id:uuid(999)}]},scope));
});
test("fotografía v2: no se consulta en producción ni con una sesión no autorizada", async t => {
  configure(t,{SUPABASE_PHASE4_WRITE_TARGET:""});
  const h=harness();await assert.rejects(()=>loadCertificationSnapshot(h.client,scope),/aislado/);
  assert.ok(!h.calls.some(c=>c.name === "mundialito_get_acta_snapshot"));
  await assert.rejects(()=>loadCertificationSnapshot(harness({admin:false}).client,scope),/administrativa/);
});
test("certificación v2: sin huella no llama RPC, jamás recurre a la función antigua", async t => {
  configure(t);const h=harness();
  await assert.rejects(()=>certifyMatchReview(h.client,scope,null,{...raw,basis:undefined},true),/fotografía completa/);
  assert.ok(!h.calls.some(c=>c.name === "mundialito_certify_match_events_v2" || c.name === "mundialito_certify_match_events"));
  let sent=0;const transport=adminFetch(origin,async()=>{sent++;return Response.json({});});
  await assert.rejects(()=>transport(origin+"/rest/v1/rpc/mundialito_certify_match_events",{method:"POST",body:JSON.stringify({})}));
  assert.equal(sent,0);
});
test("actas: admite la respuesta compuesta singular de PostgREST y rechaza filas adicionales", async t => {
  configure(t);
  const certified = {...existing,goals_complete:true,cards_complete:true,goals_reference:"Acta",cards_reference:"Acta",goals_confirmed_at:existing.updated_at,cards_confirmed_at:existing.updated_at};
  assert.equal((await certifyMatchReview(harness({rpcData:[certified]}).client,scope,null,raw,true)).cards_complete,true);
  await assert.rejects(()=>certifyMatchReview(harness({rpcData:[certified,certified]}).client,scope,null,raw,true));
});
test("transporte: certificación exacta permitida solo en aislado; campos extra, DML y cliente público rechazados", async t => {
  configure(t);let sent=0;const transport=adminFetch(origin,async()=>{sent++;return Response.json({});});
  const body={p_match_id:scope.matchId,p_expected_basis:"a".repeat(64),p_expected_updated_at:null,p_goals_complete:true,p_cards_complete:true,p_goals_reference:"Acta",p_cards_reference:"Acta",p_administrative_decision_id:null};
  const url=origin+"/rest/v1/rpc/mundialito_certify_match_events_v2";
  await transport(url,{method:"POST",body:JSON.stringify(body)});assert.equal(sent,1);
  for(const bad of [{...body,actor:uuid(800)},{...body,p_cards_reference:null},{...body,p_goals_complete:"true"},{...body,p_expected_updated_at:"bad"}]) await assert.rejects(()=>transport(url,{method:"POST",body:JSON.stringify(bad)}));
  await assert.rejects(()=>readonlyFetch(origin)(url,{method:"POST",body:JSON.stringify(body)}));
  await assert.rejects(()=>transport(origin+"/rest/v1/match_event_reviews",{method:"PATCH",body:"{}"}));
});
test("interfaz de acta: estados independientes, formulario bloqueado en producción y controles accesibles", () => {
  const source=readFileSync(new URL("../../src/app/(torneo)/mundialito/admin/partidos/review-panel.tsx",import.meta.url),"utf8");
  const exports: Record<string,unknown>={}; const require=createRequire(import.meta.url);
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  runInNewContext(code,{exports,Intl,Date,require:(id:string)=>id === "next/navigation"?{useRouter:()=>({refresh(){}})}:id === "./review-actions"?{certifyReviewAction:async()=>({error:""})}:id.endsWith("admin.module.css")?{default:{}}:require(id)});
  const Panel=exports.ReviewPanel as React.ComponentType<Record<string,unknown>>;
  const html=renderToStaticMarkup(React.createElement(Panel,{...scope,review:existing,available:true,readEnabled:true,writable:false,finished:true}));
  assert.match(html,/Pendiente de nueva revisión/);assert.match(html,/Tarjetas/);assert.match(html,/fieldset disabled/);
  assert.match(html,/certificación|certificar/i);assert.match(html,/htmlFor|for="goals-reference"/);
});
test("acción de certificación: revalida solo después de RPC confirmada y usa cookie de servidor", async () => {
  const nodeRequire=createRequire(import.meta.url);
  const source=readFileSync(new URL("../../src/app/(torneo)/mundialito/admin/partidos/review-actions.ts",import.meta.url),"utf8");
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  for(const fails of [false,true]){
    const exports:Record<string,unknown>={};const paths:string[]=[];let writableCookie=false;
    runInNewContext(code,{exports,require:(id:string)=>id === "next/cache"?{revalidatePath:(p:string)=>paths.push(p)}:
      id === "@/lib/mundialito/admin/server"?{serverAdminClient:async(w:boolean)=>{writableCookie=w;return {};}}:
      id === "@/lib/mundialito/events/reviews"?{certifyMatchReview:async()=>{if(fails)throw Error("test failure");return existing;}}:
      id === "@/lib/mundialito/players/model"?{RosterError:class extends Error{}}:nodeRequire(id)});
    const action=exports.certifyReviewAction as (binding:unknown,previous:unknown,form:FormData)=>Promise<{saved?:boolean;error:string}>;
    const result=await action({...scope,version:null},{error:""},new FormData());
    assert.equal(writableCookie,true);
    assert.equal(result.saved===true,!fails);
    assert.equal(paths.includes(`/mundialito/admin/partidos/${scope.matchId}/editar`),!fails);
    assert.equal(paths.includes("/mundialito/grupos"),!fails);
    if(fails)assert.match(result.error,/no se repetirá automáticamente/);
  }
});
