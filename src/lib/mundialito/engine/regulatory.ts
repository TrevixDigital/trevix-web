import type { TournamentSnapshot } from "./tournament.ts";
import type {
  DrawResolution,
  RankedTeam,
  TournamentData,
} from "../domain/types.ts";
import { disciplineSummary } from "./discipline.ts";

export interface DrawRequest {
  context: string;
  teamIds: string[];
  criteria: string;
  basis: string;
}
function requests(
  rows: RankedTeam[],
  context: string,
  criteria: string,
): DrawRequest[] {
  const blocks = new Map<string, RankedTeam[]>();
  for (const row of rows)
    if (row.pending.includes("draw")) {
      const key = row.possiblePositions.join(",");
      blocks.set(key, [...(blocks.get(key) ?? []), row]);
    }
  return [...blocks.values()]
    .filter(
      (block) =>
        block.length > 1 && block.every((r) => (r.stats.discipline ?? r.stats.provisionalDiscipline ?? null) !== null),
    )
    .map((block) => ({
      context,
      teamIds: block.map((r) => r.team.slug),
      criteria,
      basis: JSON.stringify({
        context,
        teams: block
          .map((r) => ({
            id: r.team.slug,
            stats: r.stats,
            positions: r.possiblePositions,
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      }),
    }));
}
/** Only genuine exhausted tiebreaks on completed groups can ask for an official draw. */
export function regulatoryReview(snapshot: TournamentSnapshot) {
  const draws = snapshot.groups
    .filter((g) => g.complete)
    .flatMap((g) =>
      requests(
        g.rows,
        `group:${g.group}`,
        "Puntos, enfrentamiento/mini tabla, diferencia de goles, goles a favor y disciplina agotados.",
      ),
    );
  if (snapshot.complete)
    draws.push(
      ...requests(
        snapshot.thirds,
        "thirds",
        "Puntos, diferencia de goles, goles a favor y disciplina agotados; sin enfrentamiento directo.",
      ),
      ...requests(
        snapshot.rankedLeaders,
        "leaders:A-D",
        "Puntos, diferencia de goles, goles a favor y disciplina agotados.",
      ),
    );
  return {
    draws,
    assignmentDraw:
      snapshot.complete &&
      snapshot.assignment.pending.includes("draw") &&
      snapshot.assignment.alternatives.length > 1,
    groups: snapshot.groups.map((g) => ({
      group: g.group,
      complete: g.complete,
      pending: [...new Set(g.rows.flatMap((r) => r.pending))],
      teams: g.rows.filter((r) => r.position === null).map((r) => r.team.slug),
    })),
  };
}
/** Preparation only: persistence with recorder, timestamp and basis still requires an approved schema. */
export function prepareOfficialDraw(
  requests: DrawRequest[],
  input: {
    context: string;
    basis: string;
    orderedTeamIds: string[];
    documentReference: string;
    confirmed: boolean;
  },
): DrawResolution {
  if (input.confirmed !== true || !input.documentReference.trim())
    throw new Error("El sorteo exige confirmación y acta.");
  const request = requests.find(
    (r) =>
      r.context === input.context &&
      r.basis === input.basis &&
      r.teamIds.length === input.orderedTeamIds.length &&
      r.teamIds.every((id) => input.orderedTeamIds.includes(id)),
  );
  if (!request || new Set(input.orderedTeamIds).size !== request.teamIds.length)
    throw new Error("Sorteo innecesario, desactualizado o con equipos ajenos.");
  return {
    context: request.context,
    orderedTeamIds: [...input.orderedTeamIds],
    documentReference: input.documentReference.trim(),
  };
}
export function groupDiscipline(data: TournamentData) {
  return data.teams.map((team) => {
    const matches = data.results.filter(
      (r) =>
        r.state === "confirmed" &&
        [r.homeTeamId, r.awayTeamId].includes(team.slug) &&
        data.fixtures.some((f) => f.id === r.matchId && f.stage === "groups"),
    );
    const complete =
      matches.length > 0 &&
      matches.every((r) => data.disciplineCoverage.includes(r.matchId));
    const summary = disciplineSummary(
      data.events.filter(
        (e) =>
          e.teamId === team.slug &&
          matches.some((r) => r.matchId === e.matchId),
      ),
    );
    return {
      teamId: team.slug,
      complete,
      observed: summary,
      yellows: complete ? summary.yellows : null,
      reds: complete ? summary.reds : null,
      points: complete ? summary.points : null,
    };
  });
}
export interface SuspensionMatch {
  id: string;
  homeTeamId?: string;
  awayTeamId?: string;
  startsAt?: string;
  status:
    "scheduled" | "live" | "finished" | "postponed" | "cancelled" | "suspended";
}
export interface RedQualification {
  eventId: string;
  kind: "without-aggression" | "aggression-pending";
  documentReference: string;
}
/** Warnings only: no automatic forfeit, permanent expulsion, or invented sanction duration. */
export function suspensionWarnings(
  data: TournamentData,
  schedule: SuspensionMatch[],
  qualifications: RedQualification[] = [],
) {
  return data.players.flatMap((player) => {
    const matches = data.results.filter(
      (r) =>
        r.state === "confirmed" &&
        [r.homeTeamId, r.awayTeamId].includes(player.teamId),
    );
    return matches.flatMap((match) => {
      const events = data.events.filter(
          (e) => e.matchId === match.matchId && e.playerId === player.id,
        ),
        cards = disciplineSummary(events);
      const doubleYellow =
        events.some((e) => e.kind === "second-yellow") ||
        events.filter((e) => e.kind === "yellow").length === 2;
      if (cards.reds === 0 && !doubleYellow) return [];
      const red = events.find((e) => e.kind === "red"),
        qualification = red
          ? qualifications.find(
              (q) => q.eventId === red.id && q.documentReference.trim(),
            )
          : undefined;
      const automatic =
        !events.some(e=>e.disciplineUncertified) &&
        (doubleYellow || qualification?.kind === "without-aggression");
      const origin = schedule.find((m) => m.id === match.matchId);
      const candidates = schedule.filter(
        (m) =>
          m.id !== match.matchId &&
          [m.homeTeamId, m.awayTeamId].includes(player.teamId) &&
          m.status !== "cancelled",
      );
      const originTime = origin?.startsAt ? Date.parse(origin.startsAt) : NaN;
      const dated = candidates
        .filter(
          (m) =>
            m.startsAt &&
            Number.isFinite(Date.parse(m.startsAt)) &&
            Date.parse(m.startsAt) > originTime,
        )
        .sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!));
      const ambiguous =
        !Number.isFinite(originTime) ||
        candidates.some(
          (m) =>
            !m.startsAt ||
            !Number.isFinite(Date.parse(m.startsAt)) ||
            m.status === "postponed" ||
            m.status === "suspended",
        ) ||
        dated.length === 0 ||
        (dated.length > 1 &&
          Date.parse(dated[0].startsAt!) === Date.parse(dated[1].startsAt!));
      return [
        {
          playerId: player.id,
          teamId: player.teamId,
          sourceMatchId: match.matchId,
          article: doubleYellow
            ? "23"
            : qualification?.kind === "without-aggression"
              ? "24"
              : qualification?.kind === "aggression-pending"
                ? "25"
                : "23/24/25",
          automatic,
          matches: automatic ? 1 : null,
          nextMatchId: automatic && !ambiguous ? dated[0].id : null,
          requiresCommittee: !automatic,
          reason: events.some(e=>e.disciplineUncertified)
            ? "Tarjetas observadas sin certificación vigente: revisar acta antes de determinar una consecuencia automática."
            : doubleYellow
            ? "Doble amarilla: un siguiente partido del equipo; no acumulación entre partidos."
            : qualification?.kind === "without-aggression"
              ? "Roja sin agresión calificada oficialmente: un partido."
              : qualification?.kind === "aggression-pending"
                ? "Agresión: duración pendiente del Comité; sin expulsión definitiva automática."
                : "Roja registrada: causa y calificación pendientes de certificación; sin expulsión definitiva automática.",
        },
      ];
    });
  });
}
