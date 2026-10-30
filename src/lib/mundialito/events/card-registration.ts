import type { SupabaseClient } from "@supabase/supabase-js";
import { checkAdminAccess } from "../admin/access.ts";
import { RosterError, isUuid } from "../players/model.ts";
import { phase4Capabilities } from "./capabilities.ts";
import type { CardEvent } from "./cards.ts";
import type { MatchValues } from "../matches/model.ts";
export function cardRegistrationCapabilities(env:Record<string,string|undefined>=process.env) {
  const caps=phase4Capabilities(env);
  const read=caps.read&&env.SUPABASE_CARD_REGISTRATION_READ_ENABLED==="true";
  return {read,write:read&&caps.cardsWrite&&env.SUPABASE_CARD_REGISTRATION_WRITES_ENABLED==="true"};
}
export interface CardRegistrationSnapshot {
  match_id:string;tournament_id:string;group_id:string|null;phase:string;status:string;
  home_team_id:string;away_team_id:string;home_score:number|null;away_score:number|null;
  home_penalties:number|null;away_penalties:number|null;
  cards:{id:string;team_id:string;player_id:string|null;event_type:string;dismissal_cause:"direct"|"second_yellow"|null}[];
}
export function registrationSnapshot(scope:{id:string;tournamentId:string;groupId:string|null;phase:string;home:string;away:string},values:MatchValues,events:readonly CardEvent[]):CardRegistrationSnapshot {
  if(![scope.id,scope.tournamentId,scope.home,scope.away].every(isUuid)||scope.home===scope.away)throw new RosterError("SCOPE","Participantes inválidos para revisar tarjetas.");
  return {match_id:scope.id,tournament_id:scope.tournamentId,group_id:scope.groupId,phase:scope.phase,status:values.status,
    home_team_id:scope.home,away_team_id:scope.away,home_score:values.home_score,away_score:values.away_score,home_penalties:values.home_penalties,away_penalties:values.away_penalties,
    cards:events.map(e=>{
      if(e.match_id!==scope.id||e.tournament_id!==scope.tournamentId||![scope.home,scope.away].includes(e.team_id))throw new RosterError("SCOPE","Tarjeta fuera del partido revisado.");
      return {id:e.id,team_id:e.team_id,player_id:e.player_id,event_type:e.event_type,dismissal_cause:e.dismissal_cause};
    }).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)};
}
export async function registerReviewedCards(client:SupabaseClient,snapshot:CardRegistrationSnapshot) {
  const access=await checkAdminAccess({
    async getVerifiedUser(){const r=await client.auth.getUser();return {user:r.data.user,error:r.error};},
    async isAdmin(){return client.rpc("is_mundialito_admin",undefined,{get:true});},
  });
  if(access!=="allowed")throw new RosterError("ACCESS","Se requiere una sesión administrativa válida para confirmar el registro de tarjetas.");
  if(!cardRegistrationCapabilities().write)throw new RosterError("CAPABILITY","La constancia operativa de tarjetas no está activada. La certificación permanece independiente.");
  const r=await client.rpc("mundialito_register_match_cards",{p_match_id:snapshot.match_id,p_expected:snapshot});
  if(r.error)throw new RosterError(r.error.code??"REGISTRATION",`Los datos anteriores pueden estar guardados, pero no se confirmó la revisión de tarjetas (${r.error.code??"error"}). Recarga o reintenta las mismas cantidades; no se supondrá un cero revisado.`);
  if(r.data?.registered!==true||typeof r.data?.repeated!=="boolean"||typeof r.data?.basis!=="string"||!/^[a-f0-9]{64}$/.test(r.data.basis))
    throw new RosterError("CONFIRMATION","No se recibió una constancia válida de tarjetas. Revisa el partido antes de reintentar.");
  return {basis:r.data.basis as string,repeated:r.data.repeated as boolean};
}
