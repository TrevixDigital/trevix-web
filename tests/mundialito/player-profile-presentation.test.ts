import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { playerFixture, loadPlayerViews } from "./player-profile-presentation-fixture.ts";
import { calculateTournament } from "../../src/lib/mundialito/engine/tournament.ts";
const { PlayerProfile, playerView, eventLabel } = loadPlayerViews();
const render = (p = playerFixture()) => renderToStaticMarkup(React.createElement(PlayerProfile, p));

test("jugador: nombre, seis colores de grupo y rutas conservadas, sin fotografías atribuidas", () => {
  const p = playerFixture();
  for (const team of p.snapshot.data.teams) {
    const html = render({ ...p, teamSlug: team.slug });
    assert.ok(html.includes(`data-player-group="${team.group}"`));
    assert.ok(html.includes(`href="/mundialito/equipos/${team.slug}"`));
    assert.ok(html.includes(p.player.fullName));
    assert.match(html, /Avatar genérico, sin fotografía del jugador/);
  }
});
test("jugador: goles, autogoles y doble amarilla respetan el motor y los puntos observados", () => {
  const p = playerFixture(), v = playerView(p);
  assert.equal(v.values.played, 1); assert.equal(v.values.goals, 2);
  assert.equal(v.values.yellows, 2); assert.equal(v.values.reds, 1); assert.equal(v.values.points, 3); assert.equal(v.ownGoals, 1);
  assert.match(render(p), /Autogoles registrados/);
  assert.match(render(p), /Expulsión por doble amarilla/);
  assert.match(render(p), /Puntos observados/);
});
test("jugador: amarilla y roja directa son cinco puntos, una sola expulsión", () => {
  const p = playerFixture(), row = p.snapshot.statistics.playerRows[1];
  const v = playerView({ ...p, player: { ...p.player, id: row.player.id }, teamSlug: row.player.teamId });
  assert.equal(v.values.yellows, 1); assert.equal(v.values.reds, 1); assert.equal(v.values.points, 5);
  assert.match(render({ ...p, player: { ...p.player, id: row.player.id }, teamSlug: row.player.teamId }), /Roja directa/);
});
test("jugador: registros ausentes no se convierten en ceros; tarjeta cero revisada sí se muestra", () => {
  const p = playerFixture();
  const data = { ...p.snapshot.data, events: [], provisionalDisciplineCoverage: [], eventCoverage: [], disciplineCoverage: [] };
  p.snapshot = calculateTournament(data);
  let v = playerView(p);
  assert.equal(v.values.goals, null); assert.equal(v.values.yellows, null); assert.equal(v.values.points, null); assert.equal(v.values.played, null);
  assert.equal(v.history.length, 0);
  const result = data.results[0];
  p.snapshot = calculateTournament({ ...data, provisionalDisciplineCoverage: [{ matchId: result.matchId, teamId: p.teamSlug }] });
  v = playerView(p);
  assert.equal(v.values.goals, null); assert.equal(v.values.played, null); assert.equal(v.values.yellows, 0); assert.equal(v.values.reds, 0); assert.equal(v.values.points, 0);
  assert.match(render(p), /Sin tarjetas en los partidos revisados/);
});
test("jugador: expulsión de causa desconocida conserva puntos pendientes, sin inventar sanciones", () => {
  const p = playerFixture(), e = p.snapshot.data.events[0];
  p.snapshot = calculateTournament({ ...p.snapshot.data, events: [{ ...e, kind: "red", disciplineUncertified: true }] });
  const v = playerView(p);
  assert.equal(v.values.points, null); assert.equal(v.values.reds, 1);
  const html = render(p);
  assert.match(html, /causa no especificada/);
  assert.doesNotMatch(html, /Sin sanciones|Jugador habilitado|Suspendido/);
});
test("jugador: opcionales NULL desaparecen y el estado solo se muestra con fuente respaldada", () => {
  const p = playerFixture();
  let html = render(p); assert.match(html, /Dorsal 23/); assert.match(html, /Delantero/);
  p.player = { ...p.player, shirtNumber: null, position: null, active: false, tournamentId: "local" };
  html = render(p); assert.doesNotMatch(html, /Dorsal|Sin dorsal|Posición no registrada|Estado en nómina/);
  p.player.tournamentId = "00000000-0000-0000-0000-000000000001";
  assert.match(render(p), /Inactivo/);
});
test("jugador: historial solo con eventos propios, fecha Guatemala, minuto cero y vínculos", () => {
  const p = playerFixture();
  const event = p.snapshot.data.events[0];
  p.snapshot = calculateTournament({ ...p.snapshot.data, events: p.snapshot.data.events.map(e => e.id === event.id ? { ...e, minute: 0 } : e) });
  p.calendar = { days: [{ id: "local-day", number: 7, date: "2026-10-23", matches: [{ id: event.matchId, number: 1, status: "finished", startsAt: "2026-10-24T02:00:00Z" }] }] };
  const v = playerView(p), html = render(p);
  assert.equal(v.history.length, p.snapshot.statistics.playerRows[0].matchIds.length);
  assert.ok(v.history.every(h => h.events.every(e => e.playerId === p.player.id)));
  assert.match(html, /23 oct 2026/); assert.match(html, /Jornada 7/); assert.match(html, /0′/);
  assert.ok(html.includes(`/mundialito/partidos/${event.matchId}`));
  assert.match(html, /no todas sus participaciones/);
});
test("jugador: comparaciones usan registros reales del equipo y no inventan un porcentaje 0/0", () => {
  const p = playerFixture(), v = playerView(p);
  assert.equal(v.shares[0].total, 2); assert.equal(v.shares[0].percent, 100);
  p.snapshot = calculateTournament({ ...p.snapshot.data, events: [] });
  assert.ok(playerView(p).shares.every(s => s.percent === null));
  assert.match(render(p), /Sin registros del equipo para comparar/);
});
test("jugador: tanda excluida del goleo y renderizado sin mutaciones ni datos de resolución", () => {
  const p = playerFixture(), before = JSON.stringify(p); render(p); assert.equal(JSON.stringify(p), before);
  assert.equal(eventLabel({ ...p.snapshot.data.events[0], phase: "shootout" }), "Lanzamiento de tanda · fuera del goleo");
  assert.match(render(p), /El goleo excluye autogoles y tandas/);
});
