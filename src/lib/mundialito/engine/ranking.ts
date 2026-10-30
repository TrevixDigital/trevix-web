import type {
  DrawResolution,
  PendingReason,
  RankedTeam,
  Team,
  TeamStats,
  TournamentData,
  GroupStanding,
  GroupId,
} from "../domain/types.ts";
import { teamTotals } from "./statistics.ts";
import { observedDisciplineSummary } from "./discipline.ts";

/** Ranking may use observed points; certification/statistics retain their own state. */
const rankingDiscipline = (r: RankedTeam) => r.stats.discipline ?? r.stats.provisionalDiscipline ?? null;

type Block = { rows: RankedTeam[]; pending: PendingReason[] };
function split(
  rows: RankedTeam[],
  key: (r: RankedTeam) => number,
  descending = true,
): RankedTeam[][] {
  const buckets = new Map<number, RankedTeam[]>();
  for (const row of rows) {
    const value = key(row);
    buckets.set(value, [...(buckets.get(value) ?? []), row]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (descending ? b - a : a - b))
    .map(([, value]) => value);
}
function officialDraw(
  rows: RankedTeam[],
  context: string,
  draws: readonly DrawResolution[],
): Block[] {
  const ids = rows.map((r) => r.team.slug);
  const decision = draws.find(
    (d) =>
      d.context === context &&
      d.orderedTeamIds.length === ids.length &&
      d.orderedTeamIds.every((id) => ids.includes(id)),
  );
  if (!decision) return [{ rows, pending: ["draw"] }];
  if (
    !decision.documentReference.trim() ||
    new Set(decision.orderedTeamIds).size !== ids.length
  )
    throw new Error("Sorteo sin acta o participantes válidos");
  return decision.orderedTeamIds.map((id) => ({
    rows: [rows.find((r) => r.team.slug === id)!],
    pending: [],
  }));
}
function finish(
  rows: RankedTeam[],
  context: string,
  data: TournamentData,
  criterion = 0,
): Block[] {
  if (rows.length <= 1) return [{ rows, pending: [] }];
  if (criterion === 3) return officialDraw(rows, context, data.draws);
  if (criterion === 2 && rows.some((r) => rankingDiscipline(r) === null))
    return [{ rows, pending: ["discipline"] }];
  const key =
    criterion === 0
      ? (r: RankedTeam) => r.stats.gd
      : criterion === 1
        ? (r: RankedTeam) => r.stats.gf
        : (r: RankedTeam) => rankingDiscipline(r)!;
  return split(rows, key, criterion !== 2).flatMap((part) =>
    finish(part, context, data, criterion + 1),
  );
}
function headToHead(rows: RankedTeam[], data: TournamentData): RankedTeam[][] {
  const ids = rows.map((r) => r.team.slug);
  const points = new Map(ids.map((id) => [id, 0]));
  const goalDifference = new Map(ids.map((id) => [id, 0]));
  const goalsFor = new Map(ids.map((id) => [id, 0]));
  for (const result of data.results) {
    const fixture = data.fixtures.find((f) => f.id === result.matchId);
    if (
      fixture?.stage !== "groups" ||
      result.state !== "confirmed" ||
      !ids.includes(result.homeTeamId) ||
      !ids.includes(result.awayTeamId)
    )
      continue;
    const draw = result.homeGoals === result.awayGoals;
    points.set(
      result.homeTeamId,
      points.get(result.homeTeamId)! +
        (draw ? 1 : result.homeGoals > result.awayGoals ? 3 : 0),
    );
    points.set(
      result.awayTeamId,
      points.get(result.awayTeamId)! +
        (draw ? 1 : result.awayGoals > result.homeGoals ? 3 : 0),
    );
    goalDifference.set(
      result.homeTeamId,
      goalDifference.get(result.homeTeamId)! +
        result.homeGoals -
        result.awayGoals,
    );
    goalDifference.set(
      result.awayTeamId,
      goalDifference.get(result.awayTeamId)! +
        result.awayGoals -
        result.homeGoals,
    );
    goalsFor.set(
      result.homeTeamId,
      goalsFor.get(result.homeTeamId)! + result.homeGoals,
    );
    goalsFor.set(
      result.awayTeamId,
      goalsFor.get(result.awayTeamId)! + result.awayGoals,
    );
  }
  const byPoints = split(rows, (r) => points.get(r.team.slug)!);
  // Two teams: direct outcome. Three: mini-table points, GD and GF.
  return rows.length === 3
    ? byPoints.flatMap((part) =>
        split(part, (r) => goalDifference.get(r.team.slug)!).flatMap((pair) =>
          split(pair, (r) => goalsFor.get(r.team.slug)!),
        ),
      )
    : byPoints;
}
function stamp(blocks: Block[]): RankedTeam[] {
  let next = 1;
  return blocks.flatMap((block) => {
    const positions = block.rows.map((_, i) => next + i);
    next += block.rows.length;
    return block.rows.map((row) => ({
      ...row,
      position: block.rows.length === 1 ? positions[0] : null,
      possiblePositions: positions,
      pending: block.pending,
    }));
  });
}
/** Cross-group comparison deliberately does NOT use head-to-head. */
export function rankAcrossGroups(
  rows: RankedTeam[],
  data: TournamentData,
  context: string,
): RankedTeam[] {
  return stamp(
    split(rows, (r) => r.stats.points).flatMap((block) =>
      finish(block, context, data),
    ),
  );
}
export function calculateStats(team: Team, data: TournamentData): TeamStats {
  const groupData = {
    ...data,
    results: data.results.filter((result) =>
      data.fixtures.some(
        (fixture) =>
          fixture.id === result.matchId && fixture.stage === "groups",
      ),
    ),
  };
  const stats=teamTotals(team,groupData);
  const results=groupData.results.filter(r=>r.state==="confirmed"&&[r.homeTeamId,r.awayTeamId].includes(team.slug));
  if(stats.discipline===null && results.length && results.every(r=>
    data.disciplineCoverage.includes(r.matchId) || data.provisionalDisciplineCoverage?.some(c=>c.matchId===r.matchId&&c.teamId===team.slug))) {
    stats.provisionalDiscipline=observedDisciplineSummary(data.events.filter(e=>e.teamId===team.slug&&results.some(r=>r.matchId===e.matchId))).points;
  }
  return stats;
}
export function calculateGroup(
  group: GroupId,
  data: TournamentData,
): GroupStanding {
  const rows: RankedTeam[] = data.teams
    .filter((t) => t.group === group)
    .map((team) => ({
      team,
      stats: calculateStats(team, data),
      position: null,
      possiblePositions: [],
      pending: [],
    }));
  const complete = rows.length === 3 && rows.every((r) => r.stats.played === 2);
  const hasResults = rows.some((r) => r.stats.played > 0);
  if (!hasResults)
    return {
      group,
      complete: false,
      hasResults,
      rows: rows.map((r) => ({
        ...r,
        possiblePositions: [1, 2, 3],
        pending: ["results"],
      })),
    };
  const blocks = split(rows, (r) => r.stats.points).flatMap((tied) => {
    if (tied.length === 1) return [{ rows: tied, pending: [] } satisfies Block];
    const mini = headToHead(tied, data);
    return mini.flatMap((part) => {
      if (part.length === 1)
        return [{ rows: part, pending: [] } satisfies Block];
      const normal = finish(part, `group:${group}`, data);
      if (tied.length === 3 && part.length === 2) {
        const reapplied = headToHead(part, data).flatMap((pair) =>
          finish(pair, `group:${group}`, data),
        );
        const signature = (value: Block[]) =>
          value
            .map(
              (b) =>
                b.rows
                  .map((r) => r.team.slug)
                  .sort()
                  .join(",") +
                ":" +
                b.pending.join(","),
            )
            .join("|");
        if (signature(normal) !== signature(reapplied)) {
          if (!data.interpretation?.documentReference.trim())
            return [
              {
                rows: part,
                pending: [
                  ...new Set<PendingReason>([
                    "interpretation",
                    ...normal.flatMap((block) =>
                      block.pending.filter((reason) => reason === "discipline"),
                    ),
                  ]),
                ],
              } satisfies Block,
            ];
          return data.interpretation.reapplyHeadToHead ? reapplied : normal;
        }
      }
      return normal;
    });
  });
  return { group, rows: stamp(blocks), complete, hasResults };
}
