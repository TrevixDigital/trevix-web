import test from "node:test";
import assert from "node:assert/strict";
import { calendarRows } from "./supabase-fixtures.ts";
import { mapSupabaseCalendar } from "../../src/lib/mundialito/adapters/supabase-calendar.ts";
import type { TournamentData, MatchEvent } from "../../src/lib/mundialito/domain/types.ts";
import { calculateTournament } from "../../src/lib/mundialito/engine/tournament.ts";
import {
  disciplineSummary,
  disciplinePoints,
} from "../../src/lib/mundialito/engine/discipline.ts";
import {
  regulatoryReview,
  prepareOfficialDraw,
  groupDiscipline,
  suspensionWarnings,
  type SuspensionMatch,
} from "../../src/lib/mundialito/engine/regulatory.ts";
import { validateTournamentData } from "../../src/lib/mundialito/engine/validation.ts";
function data(): TournamentData {
  return mapSupabaseCalendar(calendarRows()).data;
}
function card(
  kind: MatchEvent["kind"],
  id: string,
  matchId: string,
  teamId: string,
  extra: Partial<MatchEvent> = {},
): MatchEvent {
  return { id, kind, matchId, teamId, playerId: "p1", ...extra };
}
function disciplineData() {
  const d = data(),
    [first, next] = d.fixtures,
    team = first.homeTeamId!;
  d.players = [
    {
      id: "p1",
      name: "Jugador Uno",
      slug: "jugador--p1",
      teamId: team,
      shirtNumber: null,
    },
  ];
  d.results = [
    {
      matchId: first.id,
      homeTeamId: first.homeTeamId!,
      awayTeamId: first.awayTeamId!,
      state: "confirmed",
      homeGoals: 0,
      awayGoals: 0,
    },
  ];
  const schedule: SuspensionMatch[] = [
    {
      id: first.id,
      homeTeamId: first.homeTeamId,
      awayTeamId: first.awayTeamId,
      startsAt: "2026-10-24T18:00:00Z",
      status: "finished",
    },
    {
      id: next.id,
      homeTeamId: next.homeTeamId,
      awayTeamId: next.awayTeamId,
      startsAt: "2026-10-31T18:00:00Z",
      status: "scheduled",
    },
  ];
  return { d, first, next, team, schedule };
}
test("reglamento: una amarilla 1, dos amarillas 3 total, roja directa conocida 4", () => {
  const { first, team } = disciplineData(),
    y = card("yellow", "y1", first.id, team),
    y2 = { ...y, id: "y2" };
  assert.deepEqual(disciplineSummary([y, y2]), {
    points: 3,
    yellows: 2,
    reds: 1,
  });
  assert.equal(disciplinePoints([y]), 1);
  assert.equal(disciplinePoints([card("red", "r", first.id, team)]), 4);
  assert.deepEqual(
    disciplineSummary([y, y2, card("second-yellow", "s", first.id, team)]),
    { points: 3, yellows: 2, reds: 1 },
  );
});
test("reglamento: tarjetas del esquema actual sin causa/acta no equivalen a disciplina oficial", () => {
  const { d, first, team } = disciplineData();
  d.events = [
    card("yellow", "y1", first.id, team, { disciplineUncertified: true }),
    card("yellow", "y2", first.id, team, { disciplineUncertified: true }),
    card("red", "r", first.id, team, { disciplineUncertified: true }),
  ];
  assert.deepEqual(disciplineSummary(d.events), {
    points: null,
    yellows: 2,
    reds: 1,
  });
  assert.equal(groupDiscipline(d).find((t) => t.teamId === team)!.points, null);
  d.disciplineCoverage = [first.id];
  assert.throws(() => validateTournamentData(d), /certificar disciplina/);
});
test("reglamento: tarjetas de eliminatorias no alteran desempate disciplinario de grupos", () => {
  const { d, first, team } = disciplineData();
  d.fixtures = [
    ...d.fixtures,
    { id: "K", stage: "final", homeTeamId: team, awayTeamId: first.awayTeamId },
  ];
  d.results = [
    ...d.results,
    {
      matchId: "K",
      state: "confirmed",
      homeTeamId: team,
      awayTeamId: first.awayTeamId!,
      homeGoals: 1,
      awayGoals: 0,
    },
  ];
  d.events = [card("yellow", "y", first.id, team), card("red", "r", "K", team)];
  d.disciplineCoverage = [first.id];
  const summary = groupDiscipline(d).find((t) => t.teamId === team)!;
  assert.equal(summary.points, 1);
  assert.equal(summary.reds, 0);
  assert.equal(summary.yellows, 1);
});
test("reglamento: sin eventos y sin acta no se certifica cero tarjetas", () => {
  const { d, team } = disciplineData();
  const summary = groupDiscipline(d).find((t) => t.teamId === team)!;
  assert.equal(summary.points, null);
  assert.equal(summary.yellows, null);
  assert.equal(summary.complete, false);
});
test("reglamento: amarillas aisladas en distintos partidos no suspenden por acumulación", () => {
  const { d, first, next, team, schedule } = disciplineData();
  d.results = [
    ...d.results,
    {
      matchId: next.id,
      state: "confirmed",
      homeTeamId: next.homeTeamId!,
      awayTeamId: next.awayTeamId!,
      homeGoals: 0,
      awayGoals: 0,
    },
  ];
  d.events = [
    card("yellow", "y1", first.id, team),
    card("yellow", "y2", next.id, team),
  ];
  assert.equal(suspensionWarnings(d, schedule).length, 0);
});
test("reglamento: doble amarilla advierte un siguiente partido sin elegir por ID/alfabeto", () => {
  const { d, first, next, team, schedule } = disciplineData();
  d.events = [
    card("yellow", "y1", first.id, team),
    card("yellow", "y2", first.id, team),
  ];
  const warning = suspensionWarnings(d, schedule)[0];
  assert.equal(warning.matches, 1);
  assert.equal(warning.nextMatchId, next.id);
  assert.equal(warning.automatic, true);
  assert.equal(
    suspensionWarnings(
      d,
      schedule.map((m) =>
        m.id === next.id ? { ...m, startsAt: undefined } : m,
      ),
    )[0].nextMatchId,
    null,
  );
  assert.equal(
    suspensionWarnings(
      d,
      schedule.map((m) =>
        m.id === next.id ? { ...m, status: "postponed" } : m,
      ),
    )[0].nextMatchId,
    null,
  );
});

test("reglamento: dos amarillas sin certificación no producen suspensión automática",()=>{
  const {d,first,team,schedule}=disciplineData();
  d.events=[card("yellow","y1",first.id,team,{disciplineUncertified:true}),card("yellow","y2",first.id,team,{disciplineUncertified:true})];
  const warning=suspensionWarnings(d,schedule)[0];
  assert.equal(warning.automatic,false);assert.equal(warning.matches,null);assert.equal(warning.nextMatchId,null);
  assert.equal(warning.requiresCommittee,true);
});

test("reglamento: calificar una roja no sustituye la revisión de un evento sin certificar",()=>{
  const {d,first,team,schedule}=disciplineData();
  d.events=[card("red","r",first.id,team,{disciplineUncertified:true})];
  const w=suspensionWarnings(d,schedule,[{eventId:"r",kind:"without-aggression",documentReference:"Calificación"}])[0];
  assert.equal(w.automatic,false);assert.equal(w.matches,null);assert.match(w.reason,/certificación/);
});
test("reglamento: roja requiere calificación; agresión no impone expulsión definitiva", () => {
  const { d, first, team, schedule } = disciplineData();
  d.events = [card("red", "r", first.id, team)];
  assert.equal(suspensionWarnings(d, schedule)[0].requiresCommittee, true);
  assert.equal(suspensionWarnings(d, schedule)[0].matches, null);
  const q = {
    eventId: "r",
    kind: "without-aggression" as const,
    documentReference: "Acta oficial",
  };
  assert.equal(suspensionWarnings(d, schedule, [q])[0].matches, 1);
  assert.equal(
    suspensionWarnings(d, schedule, [{ ...q, documentReference: " " }])[0]
      .automatic,
    false,
  );
  const aggression = suspensionWarnings(d, schedule, [
    { ...q, kind: "aggression-pending" },
  ])[0];
  assert.equal(aggression.matches, null);
  assert.equal(aggression.requiresCommittee, true);
});
test("reglamento: no se solicita sorteo antes de completar el grupo", () => {
  const { d } = disciplineData();
  assert.equal(regulatoryReview(calculateTournament(d)).draws.length, 0);
});
test("reglamento: sorteo necesario con acta, equipos exactos y contexto vigente", () => {
  const d = data();
  d.results = d.fixtures
    .filter((f) => f.stage === "groups")
    .map((f) => ({
      matchId: f.id,
      homeTeamId: f.homeTeamId!,
      awayTeamId: f.awayTeamId!,
      state: "confirmed",
      homeGoals: 0,
      awayGoals: 0,
    }));
  d.disciplineCoverage = d.results.map((r) => r.matchId);
  const req = regulatoryReview(calculateTournament(d)).draws.find(
    (r) => r.context === "group:A",
  )!;
  assert.equal(req.teamIds.length, 3);
  const input = {
    context: req.context,
    basis: req.basis,
    orderedTeamIds: [...req.teamIds].reverse(),
    documentReference: "Acta sorteo público",
    confirmed: true,
  };
  const decision = prepareOfficialDraw([req], input);
  d.draws = [decision];
  assert.equal(
    calculateTournament(d).groups[0].rows[0].team.slug,
    input.orderedTeamIds[0],
  );
  assert.throws(() => prepareOfficialDraw([], input), /innecesario/);
  assert.throws(() =>
    prepareOfficialDraw([req], { ...input, confirmed: false }),
  );
  assert.throws(() =>
    prepareOfficialDraw([req], { ...input, documentReference: " " }),
  );
  assert.throws(() =>
    prepareOfficialDraw([req], {
      ...input,
      orderedTeamIds: [req.teamIds[0], req.teamIds[0], req.teamIds[1]],
    }),
  );
  assert.throws(() => prepareOfficialDraw([req], { ...input, basis: "stale" }));
});
test("reglamento: autogol sin autor no inventa jugador y dorsal NULL es válido", () => {
  const { d, first, team } = disciplineData();
  d.results = [
    {
      matchId: first.id,
      homeTeamId: team,
      awayTeamId: first.awayTeamId!,
      state: "confirmed",
      homeGoals: 1,
      awayGoals: 1,
    },
  ];
  d.events = [
    card("goal", "g", first.id, team),
    card("goal", "og", first.id, team, { ownGoal: true, playerId: null }),
  ];
  d.eventCoverage = [first.id];
  const result = calculateTournament(d);
  assert.equal(result.statistics.scorers[0].goals, 1);
  assert.equal(result.statistics.unattributedOwnGoals, 1);
  assert.equal(result.statistics.scorers[0].player.shirtNumber, null);
  d.events = [{ ...d.events[0], playerId: null }];
  assert.throws(() => validateTournamentData(d), /jugador/);
});
