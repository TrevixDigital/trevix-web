import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarReadSnapshot } from "../supabase/read-types.ts";
import { RosterError } from "../players/model.ts";
import { parseCardState, recordedCardRegistration, type CardEvent } from "./cards.ts";
import { cardRegistrationCapabilities } from "./card-registration.ts";
/** Events and certification come from one SQL statement, not two racing queries. */
export async function readCardSnapshot(
  client: SupabaseClient,
  snapshot: CalendarReadSnapshot,
) {
  const registeredRead=cardRegistrationCapabilities().read;
  const r = await client
    .from("mundialito_public_card_snapshot")
    .select(
      registeredRead?
        "match_id,tournament_id,status,phase,home_team_id,away_team_id,home_score,away_score,cards_complete,events,cards_registered":
        "match_id,tournament_id,status,phase,home_team_id,away_team_id,home_score,away_score,cards_complete,events",
      { count: "exact" },
    )
    .eq("tournament_id", snapshot.metadata.tournament.id)
    .order("match_id")
    .range(0, 99);
  if (
    r.error ||
    !Array.isArray(r.data) ||
    r.count !== snapshot.metadata.matches.length ||
    r.data.length !== r.count
  )
    throw new RosterError(
      "CARD_SCHEMA",
        "No se pudo leer la fotografía completa de tarjetas y actas. Comprueba disponibilidad, permisos y conexión; no se asumirá una certificación.",
    );
  const events: CardEvent[] = [],
    coverage: string[] = [],
    seen = new Set<string>();
  const provisionalCoverage: {matchId:string;teamId:string}[]=[];
  const registrationIssues:{matchId:string;teamId:string;reason:"zero_unconfirmed"|"inconsistent"|"stale_snapshot"}[]=[];
  for (const rawRow of r.data) {
    // SDK's select parser cannot infer the optional-column union. Runtime
    // identity, count, event and registration checks remain mandatory below.
    const row=rawRow as unknown as {match_id:string;tournament_id:string;status:string;phase:string;
      home_team_id:string|null;away_team_id:string|null;home_score:number|null;away_score:number|null;
      cards_complete:boolean;events:Record<string,unknown>[];cards_registered?:boolean};
    const m = snapshot.metadata.matches.find((m) => m.id === row.match_id),
      result = snapshot.data.results.find((r) => r.matchId === m?.localId);
    if (
      !m ||
      row.tournament_id !== snapshot.metadata.tournament.id ||
      seen.has(row.match_id) ||
      typeof row.cards_complete !== "boolean" ||
      (registeredRead&&typeof row.cards_registered!=="boolean") ||
      !Array.isArray(row.events)
    )
      throw new RosterError(
        "DATA",
        "Fotografía de tarjetas fuera del torneo o incompleta.",
      );
    seen.add(row.match_id);
    const cards = parseCardState({
      basis: "0".repeat(64),
      events: row.events.map((e: Record<string, unknown>) => ({
        ...e,
        notes: null,
      })),
    }).events;
    if (
      cards.some(
        (e) =>
          e.match_id !== m.id ||
          e.tournament_id !== row.tournament_id ||
          ![m.homeTeamId, m.awayTeamId].includes(e.team_id),
      )
    )
      throw new RosterError(
        "DATA",
        "Tarjeta de otro encuentro o participante.",
      );
    events.push(...cards);
    const sameMatch =
      m.status === row.status &&
      m.phase === row.phase &&
      m.homeTeamId === row.home_team_id &&
      m.awayTeamId === row.away_team_id &&
      result?.state === "confirmed" &&
      result.homeGoals === row.home_score &&
      result.awayGoals === row.away_score;
    if (row.cards_complete && sameMatch) coverage.push(m.localId);
    if(result?.state==="confirmed") for(const teamId of [m.homeTeamId,m.awayTeamId]) {
      if(!teamId)continue;
      const teamCards=cards.filter(e=>e.team_id===teamId);
      const team=snapshot.metadata.teams.find(t=>t.id===teamId)!;
      const registration=recordedCardRegistration(teamCards);
      const explicitlyRegistered=registeredRead&&row.cards_registered===true;
      if(sameMatch&&(registration==="recorded"||(explicitlyRegistered&&registration==="zero_unconfirmed"))) {
        provisionalCoverage.push({matchId:m.localId,teamId:team.localSlug});
      } else if(!sameMatch)registrationIssues.push({matchId:m.localId,teamId:team.localSlug,reason:"stale_snapshot"});
      else if(!row.cards_complete&&registration!=="recorded")registrationIssues.push({matchId:m.localId,teamId:team.localSlug,reason:registration});
    }
  }
  if (new Set(events.map((e) => e.id)).size !== events.length)
    throw new RosterError(
      "DATA",
      "Tarjetas duplicadas en la fotografía pública.",
    );
  return { events, coverage, provisionalCoverage, registrationIssues };
}
