import { teams } from "../../src/lib/mundialito/data/teams.ts";
import type {
  SupabaseCalendarRows,
  ReadRow,
} from "../../src/lib/mundialito/supabase/read-types.ts";
/** Invented rows solely for adapter tests; never imported by the website. */
export const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function calendarRows(): {
  [K in keyof SupabaseCalendarRows]: ReadRow[];
} {
  const tournament = uuid(1),
    letters = ["A", "B", "C", "D", "E", "F"];
  const groups = letters.map((name, i) => ({
    id: uuid(10 + i),
    tournament_id: tournament,
    name,
  }));
  const roster = teams.map((team, i) => ({
    id: uuid(100 + i),
    tournament_id: tournament,
    group_id: groups[letters.indexOf(team.group)].id,
    name: team.name,
    slug: team.slug,
  }));
  const phases = [
    "groups",
    "round_of_16",
    "quarterfinals",
    "semifinals",
    "finals",
  ];
  const matchdays = phases.map((phase, i) => ({
    id: uuid(300 + i),
    tournament_id: tournament,
    number: i + 1,
    phase,
    scheduled_date: null,
  }));
  const matches: ReadRow[] = [];
  let matchNumber = 1;
  for (let g = 0; g < 6; g++)
    for (const [home, away] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      matches.push({
        id: uuid(400 + matchNumber),
        tournament_id: tournament,
        matchday_id: matchdays[0].id,
        match_number: matchNumber++,
        phase: "groups",
        bracket_code: null,
        group_id: groups[g].id,
        home_team_id: roster[g * 3 + home].id,
        away_team_id: roster[g * 3 + away].id,
        home_source: null,
        away_source: null,
        scheduled_at: null,
        venue: null,
        status: "scheduled",
        home_score: null,
        away_score: null,
        home_penalties: null,
        away_penalties: null,
      });
    }
  const definitions = [
    [19, "round_of_16", "O1", "1A", "T1", 1],
    [20, "round_of_16", "O2", "1B", "T2", 1],
    [21, "round_of_16", "O3", "1C", "T3", 1],
    [22, "round_of_16", "O4", "1D", "T4", 1],
    [23, "round_of_16", "O5", "1E", "2F", 1],
    [24, "round_of_16", "O6", "1F", "2E", 1],
    [25, "round_of_16", "O7", "2A", "2D", 1],
    [26, "round_of_16", "O8", "2B", "2C", 1],
    [27, "quarterfinals", "C1", "WIN", "WIN", 2],
    [28, "quarterfinals", "C2", "WIN", "WIN", 2],
    [29, "quarterfinals", "C3", "WIN", "WIN", 2],
    [30, "quarterfinals", "C4", "WIN", "WIN", 2],
    [31, "semifinals", "S1", "WIN", "WIN", 3],
    [32, "semifinals", "S2", "WIN", "WIN", 3],
    [33, "third_place", "THIRD", "LOSE", "LOSE", 4],
    [34, "final", "FINAL", "WIN", "WIN", 4],
  ] as const;
  for (const [n, phase, code, home, away, day] of definitions)
    matches.push({
      id: uuid(400 + n),
      tournament_id: tournament,
      matchday_id: matchdays[day].id,
      match_number: n,
      phase,
      bracket_code: code,
      group_id: null,
      home_team_id: null,
      away_team_id: null,
      home_source: home,
      away_source: away,
      scheduled_at: null,
      venue: null,
      status: "scheduled",
      home_score: null,
      away_score: null,
      home_penalties: null,
      away_penalties: null,
    });
  return {
    tournaments: [
      {
        id: tournament,
        slug: "mundialito-la-bomba-2026",
        name: "Mundialito La Bomba 2026",
        season: 2026,
        location: "Petén",
      },
    ],
    groups,
    teams: roster,
    matchdays,
    matches,
  };
}
