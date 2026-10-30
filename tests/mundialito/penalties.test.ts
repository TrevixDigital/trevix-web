import test from "node:test";
import assert from "node:assert/strict";
import { teams, groupIds } from "../../src/lib/mundialito/data/teams.ts";
import type {
  Fixture,
  MatchResult,
  MatchEvent,
  Player,
  DrawResolution,
} from "../../src/lib/mundialito/domain/types.ts";
import { calculateTournament } from "../../src/lib/mundialito/engine/tournament.ts";
import { bracketDefinitions } from "../../src/lib/mundialito/engine/bracket.ts";
import {
  fromSupabaseScoreColumns,
  toSupabaseScoreColumns,
} from "../../src/lib/mundialito/adapters/match-score.ts";

/** Complete synthetic fixtures ONLY for tests, never written to Supabase. */
function completeData() {
  const data = {
    teams,
    fixtures: [] as Fixture[],
    results: [] as MatchResult[],
    events: [] as MatchEvent[],
    players: teams.map((team, i): Player => ({
      id: `test-${i}`,
      name: `Jugador de prueba ${i}`,
      slug: `jugador--test-${i}`,
      teamId: team.slug,
      shirtNumber: 9,
    })),
    disciplineCoverage: [] as string[],
    eventCoverage: [] as string[],
    draws: [] as DrawResolution[],
  };
  groupIds.forEach((group, i) => {
    const members = teams.filter((team) => team.group === group);
    [
      [0, 1, i + 1],
      [0, 2, i + 2],
      [1, 2, 1],
    ].forEach(([h, a, goals], index) => {
      const fixture: Fixture = {
        id: `test-${group}-${index}`,
        stage: "groups",
        group,
        homeTeamId: members[h].slug,
        awayTeamId: members[a].slug,
      };
      const result = fromSupabaseScoreColumns(
        fixture,
        {
          home_score: goals,
          away_score: 0,
          home_penalties: null,
          away_penalties: null,
        },
        "finished",
      )!;
      data.fixtures.push(fixture);
      data.results.push(result);
      recordRegulationEvents(data, result);
    });
  });
  return data;
}
type Data = ReturnType<typeof completeData>;
function recordRegulationEvents(data: Data, result: MatchResult) {
  for (const [teamId, goals] of [
    [result.homeTeamId, result.homeGoals],
    [result.awayTeamId, result.awayGoals],
  ] as const) {
    const playerId = data.players.find((p) => p.teamId === teamId)!.id;
    data.events.push({
      id: `${result.matchId}-${teamId}-appearance`,
      matchId: result.matchId,
      teamId,
      playerId,
      kind: "appearance",
    });
    for (let i = 0; i < goals; i++)
      data.events.push({
        id: `${result.matchId}-${teamId}-goal-${i}`,
        matchId: result.matchId,
        teamId,
        playerId,
        kind: "goal",
        phase: "regulation",
      });
  }
  data.eventCoverage.push(result.matchId);
  data.disciplineCoverage.push(result.matchId);
}
function append(
  data: Data,
  id: string,
  score: [number, number],
  penalties: { home: number; away: number } | undefined,
) {
  const match = calculateTournament(data).bracket.find((m) => m.id === id)!;
  assert.ok(match.home.teamId && match.away.teamId);
  const fixture: Fixture = {
    id,
    stage: match.stage,
    homeTeamId: match.home.teamId,
    awayTeamId: match.away.teamId,
  };
  const result = fromSupabaseScoreColumns(
    fixture,
    {
      home_score: score[0],
      away_score: score[1],
      home_penalties: penalties?.home ?? null,
      away_penalties: penalties?.away ?? null,
    },
    "finished",
  )!;
  data.fixtures.push(fixture);
  data.results.push(result);
  recordRegulationEvents(data, result);
  return result;
}
const knockout: Fixture = {
  id: "O5",
  stage: "round16",
  homeTeamId: "la-pista-65",
  awayTeamId: "los-angeles",
};

test("penales: los cuatro campos conservan partido 2–2 y tanda 4–3 sin sumarlos", () => {
  const fields = {
    home_score: 2,
    away_score: 2,
    home_penalties: 4,
    away_penalties: 3,
  };
  const result = fromSupabaseScoreColumns(knockout, fields, "finished")!;
  assert.equal(result.homeGoals, 2);
  assert.equal(result.awayGoals, 2);
  assert.deepEqual(result.penalties, { home: 4, away: 3 });
  assert.deepEqual(toSupabaseScoreColumns(result, "round16"), fields);
});
test("penales: el visitante también puede ganar una tanda y avanzar", () => {
  const data = completeData();
  const result = append(data, "O5", [2, 2], { home: 3, away: 4 });
  const snapshot = calculateTournament(data);
  assert.equal(
    snapshot.bracket.find((m) => m.id === "O5")!.winnerId,
    result.awayTeamId,
  );
  assert.equal(
    snapshot.bracket.find((m) => m.id === "C1")!.away.teamId,
    result.awayTeamId,
  );
});
test("penales: propagación por tanda desde los ocho octavos hasta tercer lugar y final", () => {
  const data = completeData();
  for (const definition of bracketDefinitions) {
    const result = append(data, definition.id, [0, 0], { home: 5, away: 4 });
    const snapshot = calculateTournament(data),
      match = snapshot.bracket.find((m) => m.id === definition.id)!;
    assert.equal(match.winnerId, result.homeTeamId, definition.id);
    assert.equal(match.loserId, result.awayTeamId, definition.id);
    assert.equal(match.result!.homeGoals, 0);
    assert.equal(match.result!.awayGoals, 0);
  }
  const matches = calculateTournament(data).bracket,
    find = (id: string) => matches.find((m) => m.id === id)!;
  assert.equal(find("S1").home.teamId, find("C1").winnerId);
  assert.equal(find("S1").away.teamId, find("C3").winnerId);
  assert.equal(find("F").home.teamId, find("S1").winnerId);
  assert.equal(find("F").away.teamId, find("S2").winnerId);
  assert.equal(find("P3").home.teamId, find("S1").loserId);
  assert.equal(find("P3").away.teamId, find("S2").loserId);
});
test("penales: goles reglamentarios sí cuentan; goles de tanda no generan eventos ni alteran GF/GC", () => {
  const data = completeData(),
    before = calculateTournament(data);
  const result = append(data, "O5", [2, 2], { home: 4, away: 3 });
  const snapshot = calculateTournament(data);
  for (const teamId of [result.homeTeamId, result.awayTeamId]) {
    const previous = before.statistics.playerRows.find(
      (r) => r.player.teamId === teamId,
    )!;
    const current = snapshot.statistics.playerRows.find(
      (r) => r.player.teamId === teamId,
    )!;
    assert.equal(current.goals, previous.goals + 2);
    assert.equal(
      snapshot.statistics.scorers.find((r) => r.player.teamId === teamId)!
        .goals,
      current.goals,
    );
    const oldTeam = before.statistics.teamRows.find(
      (r) => r.team.slug === teamId,
    )!.stats;
    const newTeam = snapshot.statistics.teamRows.find(
      (r) => r.team.slug === teamId,
    )!.stats;
    assert.equal(newTeam.gf, oldTeam.gf + 2);
    assert.equal(newTeam.ga, oldTeam.ga + 2);
    assert.equal(newTeam.gd, oldTeam.gd);
  }
  assert.equal(
    data.events.filter((e) => e.matchId === "O5" && e.kind === "goal").length,
    4,
  );
  assert.ok(data.events.every((e) => e.phase !== "shootout"));
  const beforeSerialize = JSON.stringify(data.events);
  assert.deepEqual(
    Object.keys(toSupabaseScoreColumns(result, "round16")).sort(),
    ["away_penalties", "away_score", "home_penalties", "home_score"],
  );
  assert.equal(JSON.stringify(data.events), beforeSerialize);
});
test("penales: las tarjetas se mantienen después de una tanda", () => {
  const data = completeData(),
    result = append(data, "O5", [1, 1], { home: 4, away: 3 });
  for (const [teamId, kind] of [
    [result.homeTeamId, "yellow"],
    [result.awayTeamId, "red"],
  ] as const) {
    const playerId = data.players.find((p) => p.teamId === teamId)!.id;
    data.events.push({
      id: `card-${teamId}`,
      matchId: "O5",
      teamId,
      playerId,
      kind,
    });
  }
  const stats = calculateTournament(data).statistics;
  const home = stats.playerRows.find(
    (r) => r.player.teamId === result.homeTeamId,
  )!;
  const away = stats.playerRows.find(
    (r) => r.player.teamId === result.awayTeamId,
  )!;
  assert.equal(home.yellows, 1);
  assert.equal(home.discipline, 1);
  assert.equal(away.reds, 1);
  assert.equal(away.discipline, 4);
});
test("penales: empate finalizado sin tanda no clasifica a ningún equipo", () => {
  const data = completeData();
  append(data, "O5", [2, 2], undefined);
  const snapshot = calculateTournament(data),
    match = snapshot.bracket.find((m) => m.id === "O5")!;
  assert.equal(match.winnerId, undefined);
  assert.equal(match.loserId, undefined);
  assert.ok(match.pending.includes("penalties"));
  assert.equal(
    snapshot.bracket.find((m) => m.id === "C1")!.away.teamId,
    undefined,
  );
});
test("penales: NULL de partido finalizado no se transforma en 0–0", () => {
  assert.throws(
    () =>
      fromSupabaseScoreColumns(
        knockout,
        {
          home_score: null,
          away_score: null,
          home_penalties: 4,
          away_penalties: 3,
        },
        "finished",
      ),
    /NULL no equivale a cero/,
  );
  assert.deepEqual(toSupabaseScoreColumns(undefined, "round16"), {
    home_score: null,
    away_score: null,
    home_penalties: null,
    away_penalties: null,
  });
});
test("penales: partido scheduled no publica los valores NULL ni ceros predeterminados", () => {
  for (const value of [null, 0])
    assert.equal(
      fromSupabaseScoreColumns(
        knockout,
        {
          home_score: value,
          away_score: value,
          home_penalties: null,
          away_penalties: null,
        },
        "scheduled",
      ),
      undefined,
    );
});
test("penales: una tanda parcial o empatada no define ganador", () => {
  for (const [home, away] of [
    [4, null],
    [null, 3],
    [3, 3],
  ] as const)
    assert.throws(() =>
      fromSupabaseScoreColumns(
        knockout,
        {
          home_score: 1,
          away_score: 1,
          home_penalties: home,
          away_penalties: away,
        },
        "finished",
      ),
    );
});
test("penales: cero es un resultado válido de tanda, distinto de NULL", () => {
  const result = fromSupabaseScoreColumns(
    knockout,
    { home_score: 0, away_score: 0, home_penalties: 0, away_penalties: 1 },
    "finished",
  )!;
  assert.deepEqual(result.penalties, { home: 0, away: 1 });
  assert.equal(toSupabaseScoreColumns(result, "round16").home_penalties, 0);
});
test("penales: no se admiten tandas en grupos, partidos sin empate o aún en juego", () => {
  const fields = {
    home_score: 1,
    away_score: 1,
    home_penalties: 4,
    away_penalties: 3,
  };
  assert.throws(() =>
    fromSupabaseScoreColumns(
      { ...knockout, stage: "groups" },
      fields,
      "finished",
    ),
  );
  assert.throws(() =>
    fromSupabaseScoreColumns(
      knockout,
      { ...fields, away_score: 0 },
      "finished",
    ),
  );
  assert.throws(() => fromSupabaseScoreColumns(knockout, fields, "live"));
});
test("penales: no se admiten marcadores negativos o fraccionarios ni participantes desconocidos", () => {
  const fields = {
    home_score: 1,
    away_score: 1,
    home_penalties: 4,
    away_penalties: 3,
  };
  assert.throws(() =>
    fromSupabaseScoreColumns(
      knockout,
      { ...fields, home_penalties: -1 },
      "finished",
    ),
  );
  assert.throws(() =>
    fromSupabaseScoreColumns(
      knockout,
      { ...fields, home_score: 1.5 },
      "finished",
    ),
  );
  assert.throws(() =>
    fromSupabaseScoreColumns(
      { ...knockout, awayTeamId: undefined },
      fields,
      "finished",
    ),
  );
});
