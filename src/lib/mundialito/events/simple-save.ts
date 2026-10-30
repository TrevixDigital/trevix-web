import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkAdminAccess } from "../admin/access.ts";
import { RosterError, isUuid } from "../players/model.ts";
import { readAdminMatches, saveAdminMatch } from "../matches/repository.ts";
import { MATCH_FIELDS, validateMatchValues } from "../matches/model.ts";
import { readEvents } from "./read.ts";
import { saveEvent } from "./repository.ts";
import { loadPlayerCards, savePlayerCards } from "./card-repository.ts";
import { cardDefaults, cardValues } from "./cards.ts";
import { phase4Capabilities } from "./capabilities.ts";
import { playerTotals, validateTotals, goalTotals, type SimpleBinding, type SimpleInput, type SimpleSaveState } from "./simple-acta.ts";
import type { OfficialEvent } from "./model.ts";
import { cardRegistrationCapabilities, registrationSnapshot, registerReviewedCards } from "./card-registration.ts";
import { assertKnockoutDependencies,assertKnockoutDatabaseReady,assertKnockoutResultWriteEnabled,knockoutProgressionEnabled } from "../matches/progression.ts";

// This queue serializes this server's coordinated saves. Database CAS/RPC checks
// remain necessary: it is not a distributed database transaction or lock.
const queues = new Map<string, Promise<void>>();
export function operationUuid(seed: string) {
  const h = createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
const sameEvent = (a: OfficialEvent, b: OfficialEvent) =>
  a.id === b.id && a.updated_at === b.updated_at && a.team_id === b.team_id && a.player_id === b.player_id && a.event_type === b.event_type && a.minute === b.minute && a.notes === b.notes;
const sameNew = (a: OfficialEvent, b: {team_id: string; player_id: string | null; event_type: string}) =>
  a.team_id === b.team_id && a.player_id === b.player_id && a.event_type === b.event_type && a.minute === null && a.notes === null;

export async function saveSimpleActa(client: SupabaseClient, binding: SimpleBinding, input: SimpleInput): Promise<SimpleSaveState> {
  const previous = queues.get(binding.id) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.then(() => gate);
  queues.set(binding.id, tail);
  await previous;
  const completed: string[] = [], warnings: string[] = [];
  let writesStarted = false;
  try {
    const access = await checkAdminAccess({
      async getVerifiedUser() { const r = await client.auth.getUser(); return {user:r.data.user,error:r.error}; },
      async isAdmin() { return client.rpc("is_mundialito_admin", undefined, {get:true}); },
    });
    if (access !== "allowed") throw new RosterError("ACCESS", "Inicia sesión con un usuario administrador para guardar el partido.");
    if (!isUuid(binding.id) || !isUuid(binding.operationId)) throw new RosterError("SCOPE", "Identidad del partido inválida.");
    const totals = validateTotals(input.totals, binding);
    const target = validateMatchValues({...binding.values, status:input.status, home_score:input.home_score, away_score:input.away_score, home_penalties:input.home_penalties, away_penalties:input.away_penalties}, binding.phase);
    assertKnockoutResultWriteEnabled(binding.phase,binding.values,target);
    if(binding.phase!=="groups"&&knockoutProgressionEnabled())await assertKnockoutDatabaseReady(client);
    const initial = playerTotals(binding);
    const changedCards = totals.filter(r => {
      const old = initial.find(o => o.playerId === r.playerId && o.teamId === r.teamId)!;
      return r.yellows !== old.yellows || r.directReds !== old.directReds;
    });
    if (changedCards.length && !phase4Capabilities().cardsWrite)
      throw new RosterError("CAPABILITY", "El guardado de tarjetas está desactivado. No se guardó ninguna sección.");
    // Validate every card operation before starting any writes, preserving known
    // minutes, notes and identities. Exceptional histories require explicit review.
    const cardPlans = changedCards.map(r => {
      const state = binding.cards[r.playerId!]!;
      if (!state || cardDefaults(state).reviewRequired || state.events.some(e => e.event_type === "red_card" && !e.dismissal_cause))
        throw new RosterError("REVIEW", "Hay tarjetas históricas sin causa definida. Revisa ese jugador antes de cambiar sus cantidades.");
      const old = state.events.filter(e => e.event_type === "yellow_card").sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
      const raw: Record<string, unknown> = {yellows:r.yellows,direct_reds:r.directReds,red_minute:null};
      for (let i=0;i<r.yellows;i++) { raw[`yellow_id_${i}`]=old[i]?.id??null; raw[`yellow_minute_${i}`]=old[i]?.minute??null; }
      cardValues(raw,state);
      return {row:r,state,raw,requestId:operationUuid(`${binding.operationId}:cards:${r.playerId}`)};
    });
    const context = await readAdminMatches(client);
    const current = context.records.find(r => r.id === binding.id);
    const match = context.metadata.matches.find(r => r.id === binding.id);
    if (!current || !match || binding.teams.length !== 2 || binding.teams[0].id !== match.homeTeamId || binding.teams[1].id !== match.awayTeamId)
      throw new RosterError("SCOPE", "Los participantes del partido cambiaron o todavía no están definidos. Recarga.");
    const markerMatches = () => MATCH_FIELDS.every(k => k === "scheduled_at" ? Date.parse(String(current[k])) === Date.parse(String(target[k])) || current[k] === target[k] : current[k] === target[k]);
    if (current.updated_at !== binding.version && !markerMatches())
      throw new RosterError("CONFLICT", "Otro administrador cambió el partido. Recarga antes de guardar.");
    assertKnockoutDependencies(context,binding.id,target);

    const inserts: {id:string; values:{team_id:string;player_id:string|null;event_type:"goal"|"own_goal";minute:null;notes:null}}[] = [];
    const deletes: OfficialEvent[] = [];
    for (const r of totals) for (const type of ["goal","own_goal"] as const) {
      const old = binding.goals.filter(e => e.team_id===r.teamId && e.player_id===r.playerId && e.event_type===type).sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
      const count = type === "goal" ? r.goals : r.ownGoals;
      // Every added goal is an individual historical event. Reject impractical
      // batches explicitly rather than exhausting the server or truncating counts.
      if (count-old.length>250) throw new RosterError("VALIDATION", "Revisa la cantidad de goles: un guardado admite hasta 250 goles nuevos por jugador.");
      deletes.push(...old.slice(count));
      for(let i=old.length;i<count;i++) inserts.push({id:operationUuid(`${binding.operationId}:${r.teamId}:${r.playerId}:${type}:${i}`),values:{team_id:r.teamId,player_id:r.playerId,event_type:type,minute:null,notes:null}});
    }
    const checkGoals = async () => {
      const live = (await readEvents(client,context.metadata.tournament.id)).filter(e=>e.match_id===binding.id && ["goal","own_goal"].includes(e.event_type));
      for(const e of live) {
        const old=binding.goals.find(o=>o.id===e.id), added=inserts.find(o=>o.id===e.id);
        if (!(old && sameEvent(old,e)) && !(added && sameNew(e,added.values))) throw new RosterError("CONFLICT", "Los goles cambiaron en otra sesión. Se detuvo el guardado; recarga para revisar lo confirmado.");
      }
      for(const e of binding.goals) if(!deletes.some(d=>d.id===e.id)&&!live.some(l=>l.id===e.id))
        throw new RosterError("CONFLICT", "Otro administrador eliminó un gol. Recarga el partido.");
      return live;
    };
    await checkGoals();
    const checkUntouchedCards = async () => {
      const live=(await readEvents(client,context.metadata.tournament.id)).filter(e=>e.match_id===binding.id&&["yellow_card","red_card"].includes(e.event_type)&&!cardPlans.some(p=>p.row.playerId===e.player_id));
      const original=Object.values(binding.cards).flatMap(s=>s.events).filter(e=>!cardPlans.some(p=>p.row.playerId===e.player_id));
      if(live.length!==original.length||live.some(e=>!original.some(o=>sameEvent(o,e))))
        throw new RosterError("CONFLICT", "Las tarjetas que estabas consultando cambiaron en otra sesión. Recarga el partido para ver las cantidades actuales.");
    };
    await checkUntouchedCards();
    // Inspect all changed card bases first. A retry is allowed only through the
    // existing receipt RPC with the original request UUID and original payload.
    for(const p of cardPlans) {
      const now=await loadPlayerCards(client,{matchId:binding.id,teamId:p.row.teamId,playerId:p.row.playerId!});
      if(now.basis!==p.state.basis) {
        const receipt=await client.from("mundialito_card_requests").select("id").eq("id",p.requestId).maybeSingle();
        if(receipt.error||!receipt.data) throw new RosterError("CONFLICT", "Las tarjetas cambiaron en otra sesión. Recarga antes de guardar.");
      }
    }
    const savedCardBases: {plan:typeof cardPlans[number];basis:string;events:import("./cards.ts").CardEvent[]}[]=[];
    for(const p of cardPlans) {
      writesStarted = true;
      const saved=await savePlayerCards(client,{matchId:binding.id,teamId:p.row.teamId,playerId:p.row.playerId!,state:p.state,requestId:p.requestId},p.raw,true);
      if(saved.superseded) throw new RosterError("CONFLICT", "Estas tarjetas se guardaron y después fueron corregidas en otra sesión. Recarga.");
      savedCardBases.push({plan:p,basis:saved.state.basis,events:saved.state.events});
      completed.push(`Tarjetas de ${binding.players.find(x=>x.id===p.row.playerId)!.fullName}`);
    }
    for(const e of deletes) {
      const live=await checkGoals();
      if(live.some(x=>x.id===e.id)) { writesStarted = true; await saveEvent(client,{id:e.id,matchId:binding.id,mode:"delete",version:e.updated_at,confirmed:true}); }
      completed.push(`Corrección de goles de ${binding.players.find(p=>p.id===e.player_id)?.fullName??"autor no identificado"}`);
    }
    for(const e of inserts) {
      await checkGoals();
      writesStarted = true;
      await saveEvent(client,{id:e.id,matchId:binding.id,mode:"create",confirmed:true,values:e.values});
      completed.push(`Goles de ${binding.players.find(p=>p.id===e.values.player_id)?.fullName??"autor no identificado"}`);
    }
    const afterGoals=await checkGoals();
    for(const r of totals) for(const type of ["goal","own_goal"] as const)
      if(afterGoals.filter(e=>e.team_id===r.teamId&&e.player_id===r.playerId&&e.event_type===type).length!==(type==="goal"?r.goals:r.ownGoals))
        throw new RosterError("CONFLICT", "No se confirmó la cantidad de goles. Recarga para revisar antes de continuar.");
    completed.push("Goles y autogoles");
    await checkUntouchedCards();
    for(const {plan:p,basis} of savedCardBases) {
      const now=await loadPlayerCards(client,{matchId:binding.id,teamId:p.row.teamId,playerId:p.row.playerId!});
      if(now.basis!==basis) throw new RosterError("CONFLICT", "Las tarjetas se corrigieron durante el guardado. Se detuvo la publicación del marcador; recarga para revisar.");
    }
    // Publish the requested match status/result last; never derive it from goals.
    writesStarted = true;
    const saved=await saveAdminMatch(client,{id:binding.id,version:binding.version,values:target as unknown as Record<string,unknown>,confirmed:true});
    completed.push("Marcador y estado");
    if(saved.progression?.assigned.length)completed.push(`Avance guardado: ${saved.progression.assigned.join(", ")}`);
    if(cardRegistrationCapabilities().write&&["live","finished"].includes(target.status)&&target.home_score!==null&&target.away_score!==null) {
      // Only reviewed inputs and this operation's exact RPC responses may attest
      // completeness. Never attest a fresh but unreviewed concurrent card set.
      const reviewed=Object.entries(binding.cards).flatMap(([playerId,state])=>{
        const saved=savedCardBases.find(s=>s.plan.row.playerId===playerId);
        return saved?saved.events:state.events;
      });
      await registerReviewedCards(client,registrationSnapshot({id:binding.id,tournamentId:context.metadata.tournament.id,
        groupId:current.group_id as string|null,phase:binding.phase,home:binding.teams[0].id,away:binding.teams[1].id},target,reviewed));
      completed.push("Tarjetas revisadas, incluidos los ceros");
    }
    if(saved.warning) warnings.push(saved.warning);
    const score=goalTotals(totals,binding.teams);
    if(target.home_score!==null&&(score[0]!==target.home_score||score[1]!==target.away_score))
      warnings.push(`Marcador oficial ${target.home_score}–${target.away_score}; goles individuales ${score[0]}–${score[1]}. Se conservaron por separado, sin inventar goleadores.`);
    return {error:"",completed,success:true,warnings};
  } catch(error) {
    return {error:error instanceof RosterError?error.message:"No se pudo confirmar el guardado. Puede haber cambios ya guardados. Reintenta sin cambiar las cantidades o recarga para revisar.",completed,
      retryOnly:writesStarted||(error instanceof RosterError&&["CONFLICT","40001"].includes(error.code)),
      warnings:writesStarted?["El guardado se realiza por secciones. Ante un error de conexión, una operación puede haber quedado guardada aunque no se recibiera su confirmación. Reintentar las mismas cantidades no crea duplicados."]:[]};
  } finally { release(); if(queues.get(binding.id)===tail) queues.delete(binding.id); }
}
