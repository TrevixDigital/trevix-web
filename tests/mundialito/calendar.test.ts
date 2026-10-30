import test from "node:test";
import assert from "node:assert/strict";
import { calendarRows } from "./supabase-fixtures.ts";
import { mapSupabaseCalendar } from "../../src/lib/mundialito/adapters/supabase-calendar.ts";
import { selectCalendar, guatemalaDate } from "../../src/lib/mundialito/calendar.ts";
const now = new Date("2026-10-26T18:00:00Z");
function snapshot() {
  return mapSupabaseCalendar(calendarRows());
}

test("calendario: fecha pasada scheduled no significa disputada ni se elige como próxima", () => {
  const s = snapshot();
  s.metadata.matchdays[0].scheduledDate = "2026-10-24";
  const result = selectCalendar(s.data, s.metadata, now);
  assert.equal(result.last, null);
  assert.equal(result.next, null);
  assert.equal(result.days.flatMap((d) => d.matches).length, 34);
});
test("calendario: elige la jornada futura más cercana, no todo el calendario", () => {
  const s = snapshot();
  s.metadata.matchdays[0].scheduledDate = "2026-10-24";
  s.metadata.matchdays[1].scheduledDate = "2026-10-31";
  s.metadata.matchdays[2].scheduledDate = "2026-11-07";
  const result = selectCalendar(s.data, s.metadata, now);
  assert.equal(result.next?.id, s.metadata.matchdays[1].id);
  assert.equal(result.next?.matches.length, 8);
  assert.equal(result.last, null);
});
test("calendario: finalizados se identifican por estado aunque no se importen resultados", () => {
  const s = snapshot();
  s.metadata.matchdays[0].scheduledDate = "2026-10-24";
  s.metadata.matches[0].status = "finished";
  const result = selectCalendar(s.data, s.metadata, now);
  assert.equal(result.last?.id, s.metadata.matchdays[0].id);
  assert.deepEqual(s.data.results, []);
  assert.equal(result.next, null);
});
test("calendario: live, postponed, cancelled y suspended no se publican como próximos ni finalizados", () => {
  const s = snapshot();
  s.metadata.matchdays.forEach((d) => (d.scheduledDate = "2026-11-07"));
  const statuses = ["live", "postponed", "cancelled", "suspended"] as const;
  s.metadata.matches.forEach(
    (m, i) => (m.status = statuses[i % statuses.length]),
  );
  const result = selectCalendar(s.data, s.metadata, now);
  assert.equal(result.next, null);
  assert.equal(result.last, null);
});
test("calendario: conserva UUID de jornadas, números oficiales y relaciones sin agrupar solo por fecha", () => {
  const s = snapshot();
  s.metadata.matchdays.reverse();
  s.metadata.matchdays.forEach((d) => (d.scheduledDate = "2026-11-07"));
  const result = selectCalendar(s.data, s.metadata, now);
  assert.deepEqual(
    result.days.map((d) => d.number),
    [1, 2, 3, 4, 5],
  );
  assert.equal(result.days.length, 5);
  assert.deepEqual(
    result.days[1].matches.map((m) => m.number),
    [19, 20, 21, 22, 23, 24, 25, 26],
  );
});
test("calendario: NULL de jornada/fecha no crea una jornada oficial ni una próxima fecha", () => {
  const s = snapshot();
  s.metadata.matches[0].matchdayId = null;
  const result = selectCalendar(s.data, s.metadata, now);
  assert.equal(result.next, null);
  assert.equal(result.days.at(-1)?.number, null);
  assert.equal(
    result.days.at(-1)?.matches[0].id,
    s.metadata.matches[0].localId,
  );
});
test("calendario: usa el día de Guatemala y mantiene pendientes los partidos de hoy", () => {
  assert.equal(guatemalaDate("2026-10-27T02:00:00Z"), "2026-10-26");
  const s = snapshot();
  s.metadata.matchdays[0].scheduledDate = "2026-10-26";
  assert.equal(
    selectCalendar(s.data, s.metadata, new Date("2026-10-27T02:00:00Z")).next
      ?.number,
    1,
  );
  assert.equal(
    selectCalendar(s.data, s.metadata, new Date("2026-10-27T06:00:00Z")).next,
    null,
  );
});
test("calendario: conserva la hora real del partido sin convertir la fecha de jornada en hora", () => {
  const s = snapshot();
  s.data.fixtures[0].startsAt = "2026-10-31T15:00:00Z";
  const result = selectCalendar(s.data, s.metadata, now);
  assert.equal(result.next?.number, 1);
  assert.equal(result.next?.date, null);
  assert.equal(result.next?.matches[0].startsAt, "2026-10-31T15:00:00Z");
});
test("calendario: última fecha por estado y fecha, sin mutar entradas ni depender del reloj", () => {
  const s = snapshot();
  s.metadata.matchdays[0].scheduledDate = "2026-10-24";
  s.metadata.matchdays[1].scheduledDate = "2026-10-31";
  s.metadata.matches[0].status = "finished";
  s.metadata.matches[18].status = "finished";
  const before = JSON.stringify(s);
  assert.equal(selectCalendar(s.data, s.metadata, now).last?.number, 2);
  assert.equal(JSON.stringify(s), before);
});
test("calendario: sin fixtures devuelve estados vacíos", () => {
  const s = snapshot();
  const result = selectCalendar({ ...s.data, fixtures: [] }, null, now);
  assert.deepEqual(result, { days: [], next: null, last: null });
});
test("calendario: metadatos remotos incompletos no convierten estados desconocidos en programados", () => {
  const s = snapshot();
  s.metadata.matches.shift();
  assert.throws(
    () => selectCalendar(s.data, s.metadata, now),
    /no se asumirá su estado/,
  );
});
