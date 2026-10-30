import type { ReadRow } from "../supabase/read-types.ts";
import type { OfficialEvent } from "./model.ts";
/** Reconciliation of stored values; equality is never a certification. */
export function summarizeActa(row:ReadRow,events:readonly OfficialEvent[]) {
  const own=events.filter(e=>e.match_id===row.id);
  const goals=(team:unknown,opponent:unknown)=>own.filter(e=>
    e.event_type==="goal"&&e.team_id===team||e.event_type==="own_goal"&&e.team_id===opponent).length;
  const home=goals(row.home_team_id,row.away_team_id),away=goals(row.away_team_id,row.home_team_id);
  const hasScore=typeof row.home_score==="number"&&typeof row.away_score==="number";
  const participants=typeof row.home_team_id==="string"&&typeof row.away_team_id==="string"&&row.home_team_id!==row.away_team_id;
  const coherent=hasScore&&home===row.home_score&&away===row.away_score;
  return {homeGoals:home,awayGoals:away,hasScore,coherent,participants,
    canReview:row.status==="finished"&&participants&&coherent,
    goals:own.filter(e=>e.event_type==="goal").length,ownGoals:own.filter(e=>e.event_type==="own_goal").length,
    yellows:own.filter(e=>e.event_type==="yellow_card").length,reds:own.filter(e=>e.event_type==="red_card").length,
    message:!hasScore?"Falta registrar ambos goles del marcador.":!coherent?`Marcador ${row.home_score}–${row.away_score}; goles asignados ${home}–${away}. Revisa goles y autogoles.`:
      row.status!=="finished"?"Goles y marcador coinciden; el encuentro aún no está finalizado.":"Goles y marcador coinciden. La certificación de goles y tarjetas es independiente."};
}
