import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarReadSnapshot } from "../supabase/read-types.ts";
import type { RosterContext, RosterPlayer } from "../players/model.ts";
import { isUuid, RosterError, publicPlayerSlug } from "../players/model.ts";
import { readPlayers } from "../players/repository.ts";
import {
  EVENT_COLUMNS,
  validateEventValues,
  type OfficialEvent,
} from "./model.ts";
import { validateTournamentData } from "../engine/validation.ts";
import { calculateTournament } from "../engine/tournament.ts";
import { readCardSnapshot } from "./card-read.ts";
import type { CardEvent } from "./cards.ts";
import { phase4Capabilities } from "./capabilities.ts";
import { readClassificationDecisions, applyClassificationDecisions } from "./classification-decisions.ts";
export async function readEvents(client: SupabaseClient, tournamentId: string) {
  const all: OfficialEvent[] = [];
  let expected: number | undefined;
  for (let page = 0; page < 100; page++) {
    const r = await client
      .from("match_events")
      .select(EVENT_COLUMNS, { count: "exact" })
      .eq("tournament_id", tournamentId)
      .order("id")
      .range(all.length, all.length + 99);
    if (
      r.error ||
      !Array.isArray(r.data) ||
      r.count === null ||
      !Number.isSafeInteger(r.count) ||
      r.count < 0 ||
      (expected !== undefined && expected !== r.count)
    )
      throw new RosterError(
        "READ_EVENTS",
        "No se pudo leer el registro completo de eventos. No se utilizará un respaldo ficticio.",
      );
    expected = r.count;
    for (const row of r.data) {
      if (
        !isUuid(row.id) ||
        !isUuid(row.match_id) ||
        row.tournament_id !== tournamentId ||
        typeof row.updated_at !== "string" ||
        !Number.isFinite(Date.parse(row.updated_at))
      )
        throw new RosterError(
          "DATA",
          "Identidad o versión inválida en eventos.",
        );
      all.push({ ...row, ...validateEventValues(row) } as OfficialEvent);
    }
    if (new Set(all.map((e) => e.id)).size !== all.length)
      throw new RosterError("DATA", "Eventos repetidos en la lectura.");
    if (all.length === expected) return all;
    if (!r.data.length || all.length > expected)
      throw new RosterError("READ_EVENTS", "Lectura parcial de eventos.");
  }
  throw new RosterError("READ_EVENTS", "No se completó la lectura de eventos.");
}
export function eventScoreWarnings(
  snapshot: CalendarReadSnapshot,
  events: OfficialEvent[],
) {
  return snapshot.metadata.matches.flatMap((m) => {
    const result = snapshot.data.results.find((r) => r.matchId === m.localId);
    if (!result) return [];
    const goals = (teamId: string | null) =>
      events.filter(
        (e) =>
          e.match_id === m.id &&
          ((e.event_type === "goal" && e.team_id === teamId) ||
            (e.event_type === "own_goal" && e.team_id !== teamId)),
      ).length;
    const home = goals(m.homeTeamId),
      away = goals(m.awayTeamId);
    return home === result.homeGoals && away === result.awayGoals
      ? []
      : [
          {
            matchId: m.id,
            localId: m.localId,
            message: `Marcador ${result.homeGoals}–${result.awayGoals}; goles registrados ${home}–${away}. No se atribuirán goles ficticios; puede requerirse acta o resolución administrativa.`,
          },
        ];
  });
}
export async function enrichWithEvents(
  client: SupabaseClient,
  snapshot: CalendarReadSnapshot,
) {
  const meta = snapshot.metadata;
  const context: RosterContext = {
    tournamentId: meta.tournament.id,
    teams: meta.teams.map((t) => ({
      id: t.id,
      slug: t.localSlug,
      name: t.name,
      group: meta.groups.find((g) => g.id === t.groupId)!.localGroup,
    })),
  };
  const [players, rawEvents] = await Promise.all([
    readPlayers(client, context),
    readEvents(client, context.tournamentId),
  ]);
  const cardSnapshot =
    phase4Capabilities().read
      ? await readCardSnapshot(client, snapshot)
      : null;
  const events = cardSnapshot
    ? [
        ...rawEvents.filter(
          (e) => e.event_type !== "yellow_card" && e.event_type !== "red_card",
        ),
        ...cardSnapshot.events,
      ]
    : rawEvents;
  const mapped = events.flatMap((e) => {
    const match = meta.matches.find((m) => m.id === e.match_id),
      team = context.teams.find((t) => t.id === e.team_id),
      player = e.player_id ? players.find((p) => p.id === e.player_id) : null;
    if (
      !match ||
      !team ||
      ![match.homeTeamId, match.awayTeamId].includes(e.team_id) ||
      (e.player_id && player?.teamId !== e.team_id)
    )
      throw new RosterError(
        "DATA",
        "Evento con partido, equipo o jugador incompatibles.",
      );
    if (!snapshot.data.results.some((r) => r.matchId === match.localId))
      return [];
    return [
      {
        id: e.id,
        matchId: match.localId,
        teamId: team.slug,
        playerId: e.player_id,
        kind:
          e.event_type === "goal" || e.event_type === "own_goal"
            ? ("goal" as const)
            : e.event_type === "yellow_card"
              ? ("yellow" as const)
              : (e as Partial<CardEvent>).dismissal_cause === "second_yellow"
                ? ("second-yellow" as const)
                : ("red" as const),
        ...(e.minute === null ? {} : { minute: e.minute }),
        ...(e.event_type === "own_goal" ? { ownGoal: true } : {}),
        ...(e.event_type==="red_card"&&(e as Partial<CardEvent>).dismissal_cause
          ? {dismissalCause:(e as CardEvent).dismissal_cause!}:{}),
        ...(["red_card", "yellow_card"].includes(e.event_type) &&
        (!cardSnapshot?.coverage.includes(match.localId) ||
          (e.event_type === "red_card" &&
            !(e as Partial<CardEvent>).dismissal_cause))
          ? { disciplineUncertified: true }
          : {}),
      },
    ];
  });
  const recordedData = {
    ...snapshot.data,
    disciplineCoverage:
      cardSnapshot?.coverage ?? snapshot.data.disciplineCoverage,
    provisionalDisciplineCoverage: cardSnapshot?.provisionalCoverage ?? [],
    players: players.map((p) => ({
      id: p.id,
      name: p.fullName,
      slug: publicPlayerSlug(p),
      teamId: context.teams.find((t) => t.id === p.teamId)!.slug,
      shirtNumber: p.shirtNumber,
      ...(p.position ? { position: p.position } : {}),
    })),
    events: mapped,
  };
  const decisions=cardSnapshot?await readClassificationDecisions(client,meta):[];
  const classification=applyClassificationDecisions(recordedData,decisions,meta);
  const data={...classification.data,classificationPolicy:"sporting" as const,...(classification.confirmation&&classification.persisted?{sportingConfirmation:{id:classification.confirmation.id,basis:classification.confirmationBasis}}:{})};
  validateTournamentData(data);
  calculateTournament(data); // Full sporting validation AFTER cards and recorded draws.
  return {
    data,
    metadata: meta,
    players,
    events,
    scoreWarnings: eventScoreWarnings(snapshot, events),
    classification,
    classificationRecords:decisions,
    disciplineRegistrationIssues:cardSnapshot?.registrationIssues??[],
  };
}
export function eventDuplicate(
  values:
    | OfficialEvent
    | {
        team_id: string;
        player_id: string | null;
        event_type: string;
        minute: number | null;
      },
  events: OfficialEvent[],
  exceptId?: string,
) {
  return events.some(
    (e) =>
      e.id !== exceptId &&
      e.team_id === values.team_id &&
      e.player_id === values.player_id &&
      e.event_type === values.event_type &&
      e.minute === values.minute,
  );
}
export function playerBelongs(
  playerId: string | null,
  teamId: string,
  players: RosterPlayer[],
) {
  return (
    playerId === null ||
    players.some((p) => p.id === playerId && p.teamId === teamId)
  );
}
