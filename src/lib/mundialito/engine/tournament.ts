import { groupIds } from "../data/teams.ts";
import type {
  TournamentData,
  RankedTeam,
  GroupStanding,
} from "../domain/types.ts";
import { validateTournamentData } from "./validation.ts";
import { calculateGroup, rankAcrossGroups } from "./ranking.ts";
import { assignThirds } from "./thirds.ts";
import { generateBracket } from "./bracket.ts";
import { calculateStatistics } from "./statistics.ts";
export function calculateTournament(data: TournamentData) {
  validateTournamentData(data);
  const groups = groupIds.map((group) => calculateGroup(group, data));
  const complete = groups.every((group) => group.complete);
  const thirdCandidates = groups.map((group) => ({
    group: group.group,
    rows: group.rows.filter((r) => r.possiblePositions.includes(3)),
  }));
  const knownThirds = groups.flatMap((group) =>
    group.rows.filter((r) => r.position === 3),
  );
  const thirds =
    knownThirds.length === 6
      ? rankAcrossGroups(knownThirds, data, "thirds")
      : [];
  const leaders = groups
    .filter((g) => ["A", "B", "C", "D"].includes(g.group))
    .flatMap((g) => g.rows.filter((r) => r.position === 1));
  const rankedLeaders =
    leaders.length === 4 ? rankAcrossGroups(leaders, data, "leaders:A-D") : [];
  const assignment = assignThirds(rankedLeaders, thirds, data, complete);
  const bracket = generateBracket(groups, assignment, data);
  const statistics = calculateStatistics(data);
  return {
    data,
    groups,
    complete,
    thirds,
    thirdCandidates,
    rankedLeaders,
    assignment,
    bracket,
    statistics,
  };
}
export type TournamentSnapshot = ReturnType<typeof calculateTournament>;
export function qualification(
  row: RankedTeam,
  group: GroupStanding,
  snapshot: TournamentSnapshot,
): string {
  if (!group.hasResults) return "Sin resultados oficiales";
  const third = snapshot.thirds.find((t) => t.team.slug === row.team.slug);
  const topTwo =
    row.possiblePositions.length > 0 &&
    row.possiblePositions.every((p) => p <= 2);
  const bestThird = third && third.possiblePositions.every((p) => p <= 4);
  if (topTwo || bestThird)
    return snapshot.complete
      ? "Clasificado confirmado"
      : "Clasificación provisional";
  if (row.position === 3 && third?.possiblePositions.every((p) => p > 4))
    return snapshot.complete
      ? "No clasificado"
      : "Fuera de clasificación provisional";
  return "Clasificación pendiente";
}
