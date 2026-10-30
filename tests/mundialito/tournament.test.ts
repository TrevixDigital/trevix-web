import test from "node:test";
import assert from "node:assert/strict";
import { teams } from "../../src/lib/mundialito/data/teams.ts";
import type {
  Fixture,
  MatchResult,
  MatchEvent,
  Player,
  DrawResolution,
  GroupId,
  RankedTeam,
} from "../../src/lib/mundialito/domain/types.ts";
import {
  calculateTournament,
  qualification,
} from "../../src/lib/mundialito/engine/tournament.ts";
import { calculateGroup, rankAcrossGroups } from "../../src/lib/mundialito/engine/ranking.ts";
import { disciplinePoints } from "../../src/lib/mundialito/engine/discipline.ts";
import { assignThirds, permutations } from "../../src/lib/mundialito/engine/thirds.ts";
import { validateTournamentData } from "../../src/lib/mundialito/engine/validation.ts";
import { bracketDefinitions } from "../../src/lib/mundialito/engine/bracket.ts";
import { playerSlug } from "../../src/lib/mundialito/data/players.ts";
import { disciplineSummary } from "../../src/lib/mundialito/engine/discipline.ts";
// Synthetic inputs are restricted to tests and never imported by public pages.
function empty() {
  return {
    teams,
    fixtures: [] as Fixture[],
    results: [] as MatchResult[],
    players: [] as Player[],
    events: [] as MatchEvent[],
    disciplineCoverage: [] as string[],
    eventCoverage: [] as string[],
    draws: [] as DrawResolution[],
  };
}
type Data = ReturnType<typeof empty>;
function groupData(
  group: GroupId = "A",
  scores: [number, number][] = [
    [2, 0],
    [3, 0],
    [1, 0],
  ],
  target = empty(),
) {
  const members = teams.filter((t) => t.group === group);
  const pairs = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];
  scores.forEach(([homeGoals, awayGoals], i) => {
    const matchId = `G-${group}-${i}`,
      homeTeamId = members[pairs[i][0]].slug,
      awayTeamId = members[pairs[i][1]].slug;
    target.fixtures.push({
      id: matchId,
      stage: "groups",
      group,
      homeTeamId,
      awayTeamId,
    });
    target.results.push({
      matchId,
      homeTeamId,
      awayTeamId,
      homeGoals,
      awayGoals,
      state: "confirmed",
    });
    target.disciplineCoverage.push(matchId);
  });
  return target;
}
function completeData() {
  const data = empty();
  (["A", "B", "C", "D", "E", "F"] as GroupId[]).forEach((group, i) =>
    groupData(
      group,
      [
        [i + 1, 0],
        [i + 2, 0],
        [1, 0],
      ],
      data,
    ),
  );
  return data;
}
function player(
  data: Data,
  teamId: string,
  id = `player-${data.players.length}`,
) {
  const record = {
    id,
    name: `Jugador de prueba ${id}`,
    slug: playerSlug("Jugador de prueba", id),
    teamId,
    shirtNumber: 9,
  };
  data.players.push(record);
  return record;
}
function card(
  data: Data,
  teamId: string,
  kind: MatchEvent["kind"] = "yellow",
  matchId?: string,
) {
  const p = player(data, teamId),
    result = data.results.find(
      (r) =>
        [r.homeTeamId, r.awayTeamId].includes(teamId) &&
        (!matchId || r.matchId === matchId),
    )!;
  data.events.push({
    id: `event-${data.events.length}`,
    matchId: result.matchId,
    playerId: p.id,
    teamId,
    kind,
  });
  return p;
}
function addKnockout(
  data: Data,
  id: string,
  score: [number, number] = [1, 0],
  penalties?: { home: number; away: number },
) {
  const match = calculateTournament(data).bracket.find((m) => m.id === id)!;
  assert.ok(
    match.home.teamId && match.away.teamId,
    `Precondición: participantes ${id}`,
  );
  data.fixtures.push({
    id,
    stage: match.stage,
    homeTeamId: match.home.teamId,
    awayTeamId: match.away.teamId,
  });
  data.results.push({
    matchId: id,
    homeTeamId: match.home.teamId,
    awayTeamId: match.away.teamId,
    homeGoals: score[0],
    awayGoals: score[1],
    state: "confirmed",
    penalties,
  });
  return match;
}
test("catálogo vacío de resultados: sin posiciones ni clasificados inventados", () => {
  const snapshot = calculateTournament(empty());
  assert.equal(snapshot.groups.length, 6);
  assert.equal(snapshot.groups.flatMap((g) => g.rows).length, 18);
  assert.ok(
    snapshot.groups.every((g) => g.rows.every((r) => r.position === null)),
  );
  assert.deepEqual(snapshot.thirds, []);
  assert.deepEqual(snapshot.statistics.attack, []);
  assert.ok(snapshot.bracket.every((m) => !m.home.teamId && !m.away.teamId));
});
test("victoria 3, empate 1 y derrota 0; GF, GC y DG", () => {
  const data = groupData("A", [
      [3, 1],
      [0, 0],
      [2, 0],
    ]),
    rows = calculateGroup("A", data).rows;
  const a = rows.find((r) => r.team.slug === "la-bomba")!;
  assert.deepEqual(
    { ...a.stats, discipline: 0 },
    {
      played: 2,
      won: 1,
      drawn: 1,
      lost: 0,
      gf: 3,
      ga: 1,
      gd: 2,
      points: 4,
      discipline: 0,
    },
  );
  assert.equal(
    rows.find((r) => r.team.slug === "villa-hermosa")!.stats.points,
    3,
  );
  assert.equal(rows.find((r) => r.team.slug === "la-casaca")!.stats.points, 1);
});
test("resultados en vivo no alteran posiciones oficiales ni estadísticas", () => {
  const data = groupData();
  data.results[0].state = "live";
  data.disciplineCoverage = data.disciplineCoverage.filter(
    (id) => id !== data.results[0].matchId,
  );
  const snapshot = calculateTournament(data);
  assert.equal(snapshot.groups[0].complete, false);
  assert.equal(
    snapshot.groups[0].rows.find((r) => r.team.slug === "la-bomba")!.stats
      .played,
    1,
  );
});
test("mini tabla de tres: puntos iguales se separan por DG", () => {
  const data = groupData("A", [
      [1, 0],
      [0, 3],
      [6, 0],
    ]),
    rows = calculateGroup("A", data).rows;
  assert.deepEqual(
    rows.map((r) => r.team.slug),
    ["villa-hermosa", "la-bomba", "la-casaca"],
  ); // DG +5,-2,-3
  assert.equal(rows[0].stats.points, 3);
});
test("dos equipos empatados: el enfrentamiento directo empatado continúa a DG/GF", () => {
  const data = groupData("A", [
      [0, 0],
      [2, 0],
      [4, 0],
    ]),
    rows = calculateGroup("A", data).rows;
  assert.equal(rows[0].team.slug, "villa-hermosa");
  assert.equal(rows[0].stats.points, 4);
  assert.equal(rows[1].stats.points, 4);
});
test("mini tabla reducida a dos: sin interpretación inventada si cambia el orden", () => {
  const data = groupData("A", [
    [1, 0],
    [0, 1],
    [2, 1],
  ]);
  card(data, "villa-hermosa");
  const group = calculateGroup("A", data),
    tied = group.rows.filter((r) => r.team.slug !== "la-bomba");
  assert.ok(
    tied.every(
      (r) => r.position === null && r.pending.includes("interpretation"),
    ),
  );
  assert.equal(group.rows.find((r) => r.team.slug === "la-bomba")!.position, 3);
  const normal = calculateGroup("A", {
    ...data,
    interpretation: {
      reapplyHeadToHead: false,
      documentReference: "ACTA-INTERPRETACION",
    },
  });
  assert.equal(normal.rows[0].team.slug, "la-casaca");
  const repeated = calculateGroup("A", {
    ...data,
    interpretation: {
      reapplyHeadToHead: true,
      documentReference: "ACTA-INTERPRETACION",
    },
  });
  assert.equal(repeated.rows[0].team.slug, "villa-hermosa");
});
test("disciplina incompleta bloquea solo el criterio necesario", () => {
  const tied = groupData("A", [
    [0, 0],
    [0, 0],
    [0, 0],
  ]);
  tied.disciplineCoverage = [];
  assert.ok(
    calculateGroup("A", tied).rows.every(
      (r) => r.pending.includes("discipline") && r.position === null,
    ),
  );
  const clear = groupData();
  clear.disciplineCoverage = [];
  assert.ok(calculateGroup("A", clear).rows.every((r) => r.position !== null));
});
test("menor disciplina desempata antes del sorteo", () => {
  const data = groupData("A", [
    [0, 0],
    [0, 0],
    [0, 0],
  ]);
  card(data, "villa-hermosa", "yellow");
  card(data, "la-casaca", "red");
  assert.deepEqual(
    calculateGroup("A", data).rows.map((r) => r.team.slug),
    ["la-bomba", "villa-hermosa", "la-casaca"],
  );
});
test("amarilla, doble amarilla y roja directa sin duplicar las dos amarillas", () => {
  const event = (kind: MatchEvent["kind"], i: number): MatchEvent => ({
    id: String(i),
    matchId: "x",
    teamId: "la-bomba",
    playerId: "p",
    kind,
  });
  assert.equal(disciplinePoints([event("yellow", 1)]), 1);
  assert.equal(
    disciplinePoints([event("yellow", 1), event("second-yellow", 2)]),
    3,
  );
  assert.equal(disciplinePoints([event("yellow", 1), event("yellow", 2)]), 3);
  assert.equal(disciplinePoints([event("red", 1)]), 4);
  assert.equal(disciplinePoints([event("yellow", 1), event("red", 2)]), 5);
});
test("empate absoluto exige sorteo documentado, nunca azar ni alfabeto", () => {
  const data = groupData("A", [
    [0, 0],
    [0, 0],
    [0, 0],
  ]);
  assert.ok(
    calculateGroup("A", data).rows.every(
      (r) => r.pending.includes("draw") && r.position === null,
    ),
  );
  data.draws.push({
    context: "group:A",
    orderedTeamIds: ["la-casaca", "la-bomba", "villa-hermosa"],
    documentReference: "ACTA-SORTEO-01",
  });
  assert.deepEqual(
    calculateGroup("A", data).rows.map((r) => r.team.slug),
    ["la-casaca", "la-bomba", "villa-hermosa"],
  );
  assert.throws(() =>
    validateTournamentData({
      ...data,
      draws: [{ ...data.draws[0], documentReference: "" }],
    }),
  );
});
test("comparación de terceros: puntos, DG y GF, sin enfrentamiento directo", () => {
  const data = completeData(),
    snapshot = calculateTournament(data);
  assert.deepEqual(
    snapshot.thirds.slice(0, 4).map((r) => r.team.group),
    ["A", "B", "C", "D"],
  );
  assert.equal(snapshot.thirds[0].stats.points, 0);
  const rows = snapshot.thirds.slice(0, 2).map((r) => ({
    ...r,
    stats: { ...r.stats, points: 3, gd: 0, gf: 2, discipline: 0 },
  }));
  const compared = rankAcrossGroups(rows, data, "thirds");
  assert.ok(
    compared.every((r) => r.position === null && r.pending.includes("draw")),
  );
});
test("terceros con empate en el corte: no inventar los cuatro clasificados", () => {
  const data = completeData(),
    rows = calculateTournament(data).thirds.map((r) => ({
      ...r,
      stats: { ...r.stats, points: 0, gd: 0, gf: 0, discipline: 0 },
    }));
  const ranked = rankAcrossGroups(rows, data, "thirds");
  assert.ok(
    ranked.every(
      (r) => r.possiblePositions.includes(4) && r.possiblePositions.includes(5),
    ),
  );
  const leaders = calculateTournament(data).rankedLeaders;
  assert.equal(assignThirds(leaders, ranked, data, true).state, "pending");
});
test("proyecciones antes de completar todos los grupos", () => {
  const data = groupData(),
    snapshot = calculateTournament(data),
    group = snapshot.groups[0];
  assert.equal(snapshot.complete, false);
  assert.equal(
    qualification(group.rows[0], group, snapshot),
    "Clasificación provisional",
  );
  assert.equal(
    snapshot.bracket.find((m) => m.id === "O1")!.home.state,
    "provisional",
  );
});
test("clasificación confirmada al completar grupos y resolver criterios", () => {
  const snapshot = calculateTournament(completeData());
  assert.equal(snapshot.complete, true);
  assert.equal(snapshot.assignment.state, "confirmed");
  assert.equal(snapshot.bracket.filter((m) => m.stage === "round16").length, 8);
  const qualifiers = snapshot.groups.flatMap((g) =>
    g.rows.filter(
      (row) => qualification(row, g, snapshot) === "Clasificado confirmado",
    ),
  );
  assert.equal(qualifiers.length, 16);
});
test("artículo 12: evalúa 24 permutaciones sin repetir grupo y prioriza mejor tercero", () => {
  const data = completeData(),
    snapshot = calculateTournament(data),
    assignment = snapshot.assignment;
  assert.equal(permutations([1, 2, 3, 4]).length, 24);
  assert.equal(assignment.byGroup.D, snapshot.thirds[0].team.slug); // líder D es mejor; tercero A es mejor.
  for (const group of ["A", "B", "C", "D"] as const)
    assert.notEqual(
      data.teams.find((t) => t.slug === assignment.byGroup[group])!.group,
      group,
    );
  const leaders = snapshot.rankedLeaders,
    top = snapshot.thirds.slice(0, 4);
  const valid = permutations(top).filter((a) =>
    a.every((r, i) => r.team.group !== leaders[i].team.group),
  );
  const bestVector = top.map(
    (t) =>
      leaders.find((l) => assignment.byGroup[l.team.group] === t.team.slug)!
        .position!,
  );
  for (const alt of valid) {
    const vector = top.map(
      (t) =>
        leaders[alt.findIndex((a) => a.team.slug === t.team.slug)].position!,
    );
    const first = vector.findIndex((v, i) => v !== bestVector[i]);
    assert.ok(first === -1 || bestVector[first] < vector[first]);
  }
});
test("prioridad no usa un greedy que bloquee al último tercero", () => {
  const data = completeData(),
    snapshot = calculateTournament(data);
  // Exhaustively validate all 15 possible combinations of third-origin groups.
  const all = snapshot.thirds;
  for (let mask = 0; mask < 64; mask++) {
    const subset = all.filter((_, i) => mask & (1 << i));
    if (subset.length !== 4) continue;
    const ranked: RankedTeam[] = subset.map((r, i) => ({
      ...r,
      position: i + 1,
      possiblePositions: [i + 1],
      pending: [],
    }));
    const assignment = assignThirds(snapshot.rankedLeaders, ranked, data, true);
    assert.equal(assignment.state, "confirmed");
    assert.equal(new Set(Object.values(assignment.byGroup)).size, 4);
    for (const [g, id] of Object.entries(assignment.byGroup))
      assert.notEqual(data.teams.find((t) => t.slug === id)!.group, g);
  }
});
test("ranking de líderes pendiente de disciplina/sorteo impide confirmar asignación", () => {
  const data = completeData(),
    snapshot = calculateTournament(data);
  const leaders = snapshot.rankedLeaders.map((r) => ({
    ...r,
    position: null,
    possiblePositions: [1, 2, 3, 4],
    pending: ["draw" as const],
  }));
  assert.equal(
    assignThirds(leaders, snapshot.thirds, data, true).state,
    "pending",
  );
});
test("resolución de asignación no puede repetir grupo ni contradecir prioridades", () => {
  const data = completeData();
  assert.throws(() =>
    calculateTournament({
      ...data,
      assignmentResolution: {
        teamByLeaderGroup: {
          A: "la-casaca",
          B: "2da-del-sagrado",
          C: "el-esqueleto",
          D: "2da-la-bomba",
        },
        documentReference: "ACTA",
      },
    }),
  );
});
test("llaves oficiales O5/O6/O7/O8 y conexiones C/S", () => {
  const map = Object.fromEntries(bracketDefinitions.map((m) => [m.id, m]));
  assert.deepEqual([map.O5.home, map.O5.away], ["1:E", "2:F"]);
  assert.deepEqual([map.O6.home, map.O6.away], ["1:F", "2:E"]);
  assert.deepEqual([map.O7.home, map.O7.away], ["2:A", "2:D"]);
  assert.deepEqual([map.O8.home, map.O8.away], ["2:B", "2:C"]);
  assert.deepEqual([map.C1.home, map.C1.away], ["W:O1", "W:O5"]);
  assert.deepEqual([map.S1.home, map.S1.away], ["W:C1", "W:C3"]);
  assert.deepEqual([map.S2.home, map.S2.away], ["W:C2", "W:C4"]);
});
test("propagación de ganadores y perdedores hasta final y tercer puesto", () => {
  const data = completeData();
  for (const definition of bracketDefinitions) addKnockout(data, definition.id);
  const bracket = calculateTournament(data).bracket,
    match = (id: string) => bracket.find((m) => m.id === id)!;
  assert.equal(match("C1").home.teamId, match("O1").winnerId);
  assert.equal(match("C1").away.teamId, match("O5").winnerId);
  assert.equal(match("P3").home.teamId, match("S1").loserId);
  assert.equal(match("P3").away.teamId, match("S2").loserId);
  assert.equal(match("F").home.teamId, match("S1").winnerId);
  assert.equal(match("F").away.teamId, match("S2").winnerId);
});
test("penales definen ganador sin sumar goles a DG ni goleadores", () => {
  const data = completeData(),
    match = addKnockout(data, "O5", [1, 1], { home: 4, away: 3 });
  const home = player(data, match.home.teamId!),
    away = player(data, match.away.teamId!);
  for (const [i, p] of [home, away].entries())
    data.events.push({
      id: `reg-${i}`,
      matchId: "O5",
      playerId: p.id,
      teamId: p.teamId,
      kind: "goal",
      phase: "regulation",
    });
  data.events.push({
    id: "shootout",
    matchId: "O5",
    playerId: home.id,
    teamId: home.teamId,
    kind: "goal",
    phase: "shootout",
  });
  const snapshot = calculateTournament(data),
    resolved = snapshot.bracket.find((m) => m.id === "O5")!;
  assert.equal(resolved.winnerId, home.teamId);
  assert.equal(
    snapshot.statistics.playerRows.find((p) => p.player.id === home.id)!.goals,
    1,
  );
  const total = snapshot.statistics.teamRows.find(
    (t) => t.team.slug === home.teamId,
  )!;
  assert.equal(total.stats.gf, calculateGroup("E", data).rows[0].stats.gf + 1);
});
test("empate eliminatorio sin tanda mantiene ganador pendiente", () => {
  const data = completeData();
  addKnockout(data, "O5", [2, 2]);
  const snapshot = calculateTournament(data);
  const match = snapshot.bracket.find((m) => m.id === "O5")!;
  assert.equal(match.winnerId, undefined);
  assert.ok(match.pending.includes("penalties"));
  assert.equal(
    snapshot.bracket.find((m) => m.id === "C1")!.away.teamId,
    undefined,
  );
});
test("no propagar resultados en vivo ni resultados para participantes distintos", () => {
  const data = completeData();
  addKnockout(data, "O5");
  data.results.at(-1)!.state = "live";
  assert.equal(
    calculateTournament(data).bracket.find((m) => m.id === "O5")!.winnerId,
    undefined,
  );
  data.results.at(-1)!.awayTeamId = "la-bomba";
  assert.throws(() => calculateTournament(data));
});
test("rechaza penales en grupos, tandas empatadas y marcador negativo", () => {
  const data = groupData();
  data.results[0].penalties = { home: 4, away: 3 };
  assert.throws(() => calculateTournament(data));
  const other = completeData();
  addKnockout(other, "O5", [0, 0], { home: 3, away: 3 });
  assert.throws(() => calculateTournament(other));
  const invalid = groupData();
  invalid.results[0].homeGoals = -1;
  assert.throws(() => calculateTournament(invalid));
});
test("rechaza dobles cruces, equipos extra y resultados sin calendario", () => {
  const data = groupData();
  data.fixtures.push({ ...data.fixtures[0], id: "duplicate" });
  assert.throws(() => calculateTournament(data));
  assert.throws(() =>
    calculateTournament({
      ...empty(),
      teams: [...teams, { name: "Extra", slug: "extra", group: "A" }],
    }),
  );
  const invalid = groupData();
  invalid.fixtures = [];
  assert.throws(() => calculateTournament(invalid));
});
test("estadísticas sin cobertura completa no producen goleadores falsos", () => {
  const data = groupData();
  card(data, "la-bomba", "goal");
  const snapshot = calculateTournament(data);
  assert.equal(snapshot.statistics.eventComplete, false);
  assert.deepEqual(snapshot.statistics.scorers, []);
});
test("IDs únicos permiten jugadores homónimos y validan eventos oficiales", () => {
  assert.notEqual(
    playerSlug("Juan Pérez", "id-1"),
    playerSlug("Juan Pérez", "id-2"),
  );
  const data = groupData();
  const p = player(data, "la-bomba");
  data.players.push({ ...p, id: "another", slug: p.slug });
  assert.throws(() => calculateTournament(data));
  const broken = groupData();
  broken.eventCoverage.push(broken.results[0].matchId);
  assert.throws(() => calculateTournament(broken));
});
test("el motor no muta los datos de entrada y es determinista", () => {
  const data = completeData(),
    before = JSON.stringify(data);
  const a = calculateTournament(data),
    b = calculateTournament(data);
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(a, b);
});

test("eventos completos producen goleadores reales empatados y partidos únicos", () => {
  const data = groupData("A", [
    [1, 1],
    [0, 0],
    [0, 0],
  ]);
  const a = player(data, "la-bomba"),
    b = player(data, "villa-hermosa");
  for (const p of [a, b]) {
    data.events.push({
      id: `goal-${p.id}`,
      matchId: "G-A-0",
      teamId: p.teamId,
      playerId: p.id,
      kind: "goal",
    });
    const other = data.results.find(
      (r) =>
        r.matchId !== "G-A-0" &&
        [r.homeTeamId, r.awayTeamId].includes(p.teamId),
    )!;
    data.events.push({
      id: `appearance-${p.id}`,
      matchId: other.matchId,
      teamId: p.teamId,
      playerId: p.id,
      kind: "appearance",
    });
  }
  data.eventCoverage = data.results.map((r) => r.matchId);
  const snapshot = calculateTournament(data);
  assert.equal(snapshot.statistics.eventComplete, true);
  assert.deepEqual(
    snapshot.statistics.scorers.map((row) => [
      row.goals,
      row.played,
      row.position,
    ]),
    [
      [1, 2, 1],
      [1, 2, 1],
    ],
  );
});

test("autogol cuenta para el equipo rival, nunca como gol del jugador", () => {
  const data = groupData("A", [
      [0, 1],
      [0, 0],
      [0, 0],
    ]),
    p = player(data, "la-bomba");
  data.events.push({
    id: "own-goal",
    matchId: "G-A-0",
    teamId: p.teamId,
    playerId: p.id,
    kind: "goal",
    ownGoal: true,
  });
  data.eventCoverage = data.results.map((r) => r.matchId);
  const snapshot = calculateTournament(data);
  assert.equal(snapshot.statistics.playerRows[0].goals, 0);
  assert.deepEqual(snapshot.statistics.scorers, []);
  assert.equal(
    snapshot.groups[0].rows.find((r) => r.team.slug === "villa-hermosa")!.stats
      .gf,
    1,
  );
});

test("doble amarilla normaliza también el resumen de tarjetas", () => {
  const events: MatchEvent[] = ["yellow", "yellow", "second-yellow"].map(
    (kind, i) => ({
      id: String(i),
      matchId: "x",
      teamId: "la-bomba",
      playerId: "p",
      kind: kind as MatchEvent["kind"],
    }),
  );
  assert.deepEqual(disciplineSummary(events), {
    points: 3,
    yellows: 2,
    reds: 1,
  });
  assert.deepEqual(disciplineSummary(events.slice(0, 2)), {
    points: 3,
    yellows: 2,
    reds: 1,
  });
});

test("rechaza eventos de un jugador en el equipo equivocado y llaves ajenas", () => {
  const data = groupData(),
    p = player(data, "la-bomba");
  data.events.push({
    id: "bad-team",
    matchId: "G-A-0",
    teamId: "villa-hermosa",
    playerId: p.id,
    kind: "yellow",
  });
  assert.throws(() => calculateTournament(data));
  const other = empty();
  other.fixtures.push({ id: "inventada", stage: "quarter" });
  assert.throws(() => calculateTournament(other));
});
