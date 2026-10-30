import type {
  TournamentData,
  Team,
  TeamStats,
  Player,
} from "../domain/types.ts";
import { disciplinePoints, disciplineSummary, observedDisciplineSummary } from "./discipline.ts";
export function teamTotals(team: Team, data: TournamentData): TeamStats {
  const stats: TeamStats = {
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    points: 0,
    discipline: null,
  };
  const results = data.results.filter(
    (r) =>
      r.state === "confirmed" &&
      [r.homeTeamId, r.awayTeamId].includes(team.slug),
  );
  for (const result of results) {
    const home = result.homeTeamId === team.slug,
      gf = home ? result.homeGoals : result.awayGoals,
      ga = home ? result.awayGoals : result.homeGoals;
    stats.played++;
    stats.gf += gf;
    stats.ga += ga;
    if (gf > ga) stats.won++;
    else if (gf < ga) stats.lost++;
    else stats.drawn++;
    // Points only apply to the group stage; penalties do not change goals or W/D/L regulation totals.
    if (data.fixtures.find((f) => f.id === result.matchId)?.stage === "groups")
      stats.points += gf > ga ? 3 : gf === ga ? 1 : 0;
  }
  stats.gd = stats.gf - stats.ga;
  if (results.every((r) => data.disciplineCoverage.includes(r.matchId)))
    stats.discipline = disciplinePoints(
      data.events.filter(
        (e) =>
          e.teamId === team.slug &&
          results.some((r) => r.matchId === e.matchId),
      ),
    );
  return stats;
}
export interface PlayerStatistics {
  player: Player;
  played: number;
  goals: number;
  ownGoals: number;
  yellows: number;
  reds: number;
  discipline: number | null;
  observedDiscipline: number | null;
  matchIds: string[];
  complete: boolean;
}
export function playerStatistics(
  player: Player,
  data: TournamentData,
): PlayerStatistics {
  const matches = data.results.filter(
    (r) =>
      r.state === "confirmed" &&
      [r.homeTeamId, r.awayTeamId].includes(player.teamId),
  );
  const events = data.events.filter(
    (e) =>
      e.playerId === player.id && matches.some((r) => r.matchId === e.matchId),
  );
  const matchIds = [...new Set(events.map((e) => e.matchId))];
  return {
    player,
    matchIds,
    played: matchIds.length,
    goals: events.filter(
      (e) => e.kind === "goal" && e.phase !== "shootout" && !e.ownGoal,
    ).length,
    ownGoals: events.filter(
      (e) => e.kind === "goal" && e.ownGoal && e.phase !== "shootout",
    ).length,
    yellows: disciplineSummary(events).yellows,
    reds: disciplineSummary(events).reds,
    discipline: disciplinePoints(events),
    observedDiscipline: observedDisciplineSummary(events).points,
    complete:
      matches.length > 0 &&
      matches.every(
        (r) =>
          data.eventCoverage.includes(r.matchId) &&
          data.disciplineCoverage.includes(r.matchId),
      ),
  };
}
export function calculateStatistics(data: TournamentData) {
  const confirmed = data.results.filter((r) => r.state === "confirmed");
  const eventComplete =
    confirmed.length > 0 &&
    confirmed.every((r) => data.eventCoverage.includes(r.matchId));
  const disciplineComplete =
    confirmed.length > 0 &&
    confirmed.every((r) => data.disciplineCoverage.includes(r.matchId));
  const playerRows = data.players.map((player) =>
    playerStatistics(player, data),
  );
  const scoring = eventComplete
    ? playerRows.filter((r) => r.goals > 0).sort((a, b) => b.goals - a.goals)
    : [];
  const scorers = scoring.map((row, i) => ({
    ...row,
    position: scoring.findIndex((r) => r.goals === row.goals) + 1,
    displayIndex: i,
  }));
  const teamRows = data.teams
    .map((team) => ({ team, stats: teamTotals(team, data) }))
    .filter((r) => r.stats.played > 0);
  const teamRanking = (key: "gf" | "ga" | "discipline", ascending: boolean) => {
    const ordered = teamRows
      .filter((r) => r.stats[key] !== null)
      .sort((a, b) =>
        ascending
          ? a.stats[key]! - b.stats[key]!
          : b.stats[key]! - a.stats[key]!,
      );
    return ordered.map((row) => ({
      ...row,
      position: ordered.findIndex((r) => r.stats[key] === row.stats[key]) + 1,
    }));
  };
  return {
    scorers,
    recordedScorers: playerRows
      .filter((r) => r.goals > 0)
      .sort((a, b) => b.goals - a.goals),
    recordedOwnGoals: playerRows.filter((r) => r.ownGoals > 0),
    unattributedOwnGoals: data.events.filter(
      (e) =>
        e.kind === "goal" &&
        e.ownGoal &&
        e.playerId === null &&
        e.phase !== "shootout" &&
        confirmed.some((r) => r.matchId === e.matchId),
    ).length,
    ownGoals: eventComplete ? playerRows.filter((r) => r.ownGoals > 0) : [],
    playerRows,
    teamRows,
    eventComplete,
    disciplineComplete,
    attack: teamRanking("gf", false),
    defense: teamRanking("ga", true),
    discipline: disciplineComplete ? teamRanking("discipline", true) : [],
    highlights: [...confirmed]
      .sort((a, b) => b.homeGoals + b.awayGoals - (a.homeGoals + a.awayGoals))
      .slice(0, 5),
  };
}
