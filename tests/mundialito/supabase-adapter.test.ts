import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { calendarRows, uuid } from "./supabase-fixtures.ts";
import {
  mapSupabaseCalendar,
  readSupabaseCalendar,
} from "../../src/lib/mundialito/adapters/supabase-calendar.ts";
import { readConfiguration } from "../../src/lib/mundialito/supabase/read-config.ts";
import { readonlyFetch } from "../../src/lib/mundialito/supabase/readonly-fetch.ts";
import {
  createTournamentReader,
  READ_COLUMNS,
} from "../../src/lib/mundialito/supabase/reader.ts";
import { SupabaseReadError } from "../../src/lib/mundialito/supabase/read-types.ts";
import type {
  TournamentReader,
  ReadTable,
  ReadFilter,
} from "../../src/lib/mundialito/supabase/read-types.ts";
import { createReadRepository } from "../../src/lib/mundialito/repositories/read-repository.ts";
import { calculateTournament } from "../../src/lib/mundialito/engine/tournament.ts";
import { teams } from "../../src/lib/mundialito/data/teams.ts";
const errorCode = (code: string) => (error: unknown) =>
  error instanceof SupabaseReadError && error.code === code;

test("adaptador: los dos slugs reales distintos conservan las rutas oficiales y el valor remoto", () => {
  const rows = calendarRows();
  for (const row of rows.teams) {
    if (row.slug === "2da-la-bomba")
      (row as Record<string, unknown>).slug = "segunda-la-bomba";
    if (row.slug === "2da-del-sagrado")
      (row as Record<string, unknown>).slug = "segunda-del-sagrado";
  }
  const result = mapSupabaseCalendar(rows);
  assert.equal(
    result.data.teams.find((t) => t.name === "2da La Bomba")!.slug,
    "2da-la-bomba",
  );
  assert.equal(
    result.data.teams.find((t) => t.name === "2.da Del Sagrado")!.slug,
    "2da-del-sagrado",
  );
  assert.equal(
    result.metadata.teams.find((t) => t.slug === "segunda-la-bomba")!.localSlug,
    "2da-la-bomba",
  );
  assert.equal(
    result.metadata.teams.find((t) => t.slug === "segunda-del-sagrado")!
      .localSlug,
    "2da-del-sagrado",
  );
});

test("adaptador: un alias no permite cambiar el nombre o el grupo oficial", () => {
  const rows = calendarRows(),
    index = rows.teams.findIndex((t) => t.slug === "2da-la-bomba");
  rows.teams[index] = {
    ...rows.teams[index],
    slug: "segunda-la-bomba",
    name: "Equipo ajeno",
  };
  assert.throws(
    () => mapSupabaseCalendar(rows),
    errorCode("OFFICIAL_TEAM_MISMATCH"),
  );
});

test("adaptador: conserva 18 equipos, 6 grupos, 34 UUID y números oficiales sin resultados", () => {
  const rows = calendarRows(),
    snapshot = mapSupabaseCalendar(rows);
  assert.deepEqual(snapshot.data.teams, teams);
  assert.equal(snapshot.metadata.groups.length, 6);
  assert.equal(snapshot.data.fixtures.length, 34);
  assert.deepEqual(
    snapshot.metadata.matches.map((m) => m.matchNumber),
    Array.from({ length: 34 }, (_, i) => i + 1),
  );
  assert.equal(new Set(snapshot.metadata.matches.map((m) => m.id)).size, 34);
  assert.equal(snapshot.data.fixtures[0].id, rows.matches[0].id);
  assert.equal(snapshot.data.fixtures[0].homeTeamId, "la-bomba");
  assert.deepEqual(snapshot.data.results, []);
  assert.deepEqual(snapshot.data.players, []);
  assert.deepEqual(snapshot.data.events, []);
  const calculated = calculateTournament(snapshot.data);
  assert.ok(calculated.groups.every((g) => !g.hasResults));
  assert.ok(calculated.bracket.every((m) => !m.home.teamId && !m.away.teamId));
});
test("adaptador: NULL de fecha, sede y participantes pendientes no se convierte en valores", () => {
  const result = mapSupabaseCalendar(calendarRows());
  assert.equal(result.data.fixtures[0].startsAt, undefined);
  assert.equal(result.data.fixtures[0].venue, undefined);
  assert.equal(result.data.fixtures[18].homeTeamId, undefined);
  assert.equal(result.data.fixtures[18].awayTeamId, undefined);
  assert.equal(result.metadata.matches[18].homeTeamId, null);
  assert.equal(result.metadata.matches[18].scheduledAt, null);
});
test("adaptador: scheduled no oficializa marcadores inyectados, ceros ni goles demostrativos", () => {
  const rows = calendarRows();
  rows.matches[0] = {
    ...rows.matches[0],
    home_score: 8,
    away_score: 4,
    home_penalties: 3,
    away_penalties: 0,
  };
  const snapshot = mapSupabaseCalendar(rows);
  assert.deepEqual(snapshot.data.results, []);
  assert.equal(calculateTournament(snapshot.data).statistics.attack.length, 0);
  assert.deepEqual(snapshot.data.disciplineCoverage, []);
  assert.deepEqual(snapshot.data.eventCoverage, []);
});
test("adaptador: THIRD/FINAL son P3/F sin perder códigos ni UUID originales", () => {
  const result = mapSupabaseCalendar(calendarRows());
  assert.equal(result.data.fixtures[32].id, "P3");
  assert.equal(result.data.fixtures[33].id, "F");
  assert.equal(result.metadata.matches[32].bracketCode, "THIRD");
  assert.equal(result.metadata.matches[33].bracketCode, "FINAL");
  assert.equal(result.metadata.matches[32].id, uuid(433));
  assert.equal(result.metadata.matches[33].id, uuid(434));
});
test("adaptador: T1–T4 se conservan como asignaciones, no como ranking", () => {
  const result = mapSupabaseCalendar(calendarRows());
  assert.deepEqual(
    result.metadata.matches.slice(18, 22).map((m) => m.awaySource),
    ["T1", "T2", "T3", "T4"],
  );
  assert.ok(
    result.data.fixtures.slice(18).every((m) => !m.homeTeamId && !m.awayTeamId),
  );
});
test("adaptador: referencias genéricas conservadas con aviso y referencias precisas verificadas", () => {
  const rows = calendarRows();
  rows.matches[26] = {
    ...rows.matches[26],
    home_source: "WIN:O1",
    away_source: "WIN:O5",
  };
  const result = mapSupabaseCalendar(rows);
  assert.equal(result.metadata.matches[26].homeSource, "WIN:O1");
  assert.ok(result.metadata.notices.some((n) => n.code === "SOURCE_GENERIC"));
  rows.matches[26] = { ...rows.matches[26], home_source: "WIN:O2" };
  assert.throws(() => mapSupabaseCalendar(rows), errorCode("SOURCE_MISMATCH"));
});
test("adaptador: no inventa una fuente NULL ni acepta códigos desconocidos", () => {
  const rows = calendarRows();
  rows.matches[26] = { ...rows.matches[26], home_source: null };
  assert.ok(
    mapSupabaseCalendar(rows).metadata.notices.some(
      (n) => n.code === "SOURCE_MISSING",
    ),
  );
  rows.matches[26] = { ...rows.matches[26], home_source: "WIN:INVENTADO" };
  assert.throws(() => mapSupabaseCalendar(rows), errorCode("UNKNOWN_MAPPING"));
});
test("adaptador: calendario ordenado por números oficiales sin mutar sus filas", () => {
  const rows = calendarRows();
  rows.matches.reverse();
  const before = JSON.stringify(rows);
  const result = mapSupabaseCalendar(rows);
  assert.equal(result.metadata.matches[0].matchNumber, 1);
  assert.equal(result.metadata.matches[33].matchNumber, 34);
  assert.equal(JSON.stringify(rows), before);
});
test("adaptador: fecha con zona mantiene el instante y no toma hora de la jornada", () => {
  const rows = calendarRows();
  rows.matches[0] = {
    ...rows.matches[0],
    scheduled_at: "2026-11-07T14:00:00-06:00",
  };
  rows.matchdays[0] = { ...rows.matchdays[0], scheduled_date: "2026-11-07" };
  const result = mapSupabaseCalendar(rows);
  assert.equal(result.data.fixtures[0].startsAt, "2026-11-07T20:00:00.000Z");
  assert.equal(result.data.fixtures[1].startsAt, undefined);
  assert.equal(result.metadata.matchdays[0].scheduledDate, "2026-11-07");
  assert.equal(
    result.metadata.matches[0].scheduledAt,
    "2026-11-07T14:00:00-06:00",
  );
});
test("adaptador: rechaza fecha sin zona horaria y fecha de jornada inválida", () => {
  const rows = calendarRows();
  rows.matches[0] = { ...rows.matches[0], scheduled_at: "2026-11-07T14:00:00" };
  assert.throws(() => mapSupabaseCalendar(rows), errorCode("AMBIGUOUS_DATE"));
  const invalid = calendarRows();
  invalid.matchdays[0] = {
    ...invalid.matchdays[0],
    scheduled_date: "2026-02-30",
  };
  assert.throws(
    () => mapSupabaseCalendar(invalid),
    errorCode("INVALID_MATCHDAY_DATE"),
  );
});
test("adaptador: rechaza UUID desconocidos de equipo, grupo y jornada", () => {
  for (const [field, code] of [
    ["home_team_id", "UNKNOWN_TEAM_UUID"],
    ["away_team_id", "UNKNOWN_TEAM_UUID"],
    ["group_id", "UNKNOWN_GROUP_UUID"],
    ["matchday_id", "UNKNOWN_MATCHDAY_UUID"],
  ]) {
    const rows = calendarRows();
    rows.matches[0] = { ...rows.matches[0], [field]: uuid(999) };
    assert.throws(() => mapSupabaseCalendar(rows), errorCode(code));
  }
});
test("adaptador: rechaza equipos incompletos, extras y grupos incompletos", () => {
  const missing = calendarRows();
  missing.teams.pop();
  assert.throws(
    () => mapSupabaseCalendar(missing),
    errorCode("INCOMPLETE_TEAMS"),
  );
  const extra = calendarRows();
  extra.teams.push({ ...extra.teams[0], id: uuid(999) });
  assert.throws(
    () => mapSupabaseCalendar(extra),
    errorCode("INCOMPLETE_TEAMS"),
  );
  const groups = calendarRows();
  groups.groups.pop();
  assert.throws(
    () => mapSupabaseCalendar(groups),
    errorCode("INCOMPLETE_GROUPS"),
  );
});
test("adaptador: protege nombres, slugs y distribución exacta oficial", () => {
  for (const patch of [
    { name: "Equipo de demostración" },
    { slug: "otro-slug" },
    { group_id: uuid(11) },
  ]) {
    const rows = calendarRows();
    rows.teams[0] = { ...rows.teams[0], ...patch };
    assert.throws(
      () => mapSupabaseCalendar(rows),
      errorCode("OFFICIAL_TEAM_MISMATCH"),
    );
  }
  const duplicate = calendarRows();
  duplicate.groups[1] = { ...duplicate.groups[1], name: "A" };
  assert.throws(
    () => mapSupabaseCalendar(duplicate),
    errorCode("DUPLICATE_GROUP"),
  );
});
test("adaptador: campos obligatorios NULL no se convierten en identificadores o números", () => {
  for (const field of ["id", "group_id", "name", "slug"]) {
    const rows = calendarRows();
    rows.teams[0] = { ...rows.teams[0], [field]: null };
    assert.throws(() => mapSupabaseCalendar(rows), SupabaseReadError);
  }
  for (const field of ["home_team_id", "group_id", "match_number"]) {
    const rows = calendarRows();
    rows.matches[0] = { ...rows.matches[0], [field]: null };
    assert.throws(() => mapSupabaseCalendar(rows), SupabaseReadError);
  }
});
test("adaptador: no deduce otra fase o estado", () => {
  for (const field of ["phase", "status"]) {
    const rows = calendarRows();
    rows.matches[0] = { ...rows.matches[0], [field]: "desconocido" };
    assert.throws(() => mapSupabaseCalendar(rows), SupabaseReadError);
  }
  for (const status of [
    "live",
    "finished",
    "postponed",
    "cancelled",
    "suspended",
  ]) {
    const rows = calendarRows();
    rows.matches[0] = { ...rows.matches[0], status };
    if (status === "finished") {
      assert.throws(() => mapSupabaseCalendar(rows), /NULL no equivale a cero/);
      continue;
    }
    const snapshot = mapSupabaseCalendar(rows);
    assert.equal(snapshot.metadata.matches[0].status, status);
    assert.deepEqual(snapshot.data.results, []);
  }
});
test("adaptador: jornadas finals aceptan tercer lugar y final; las demás no se mezclan", () => {
  const rows = calendarRows();
  assert.equal(mapSupabaseCalendar(rows).metadata.matchdays[4].phase, "finals");
  rows.matches[32] = { ...rows.matches[32], matchday_id: rows.matchdays[0].id };
  assert.throws(
    () => mapSupabaseCalendar(rows),
    errorCode("MATCHDAY_PHASE_MISMATCH"),
  );
});
test("adaptador: conserva una jornada NULL sin asignarla por proximidad", () => {
  const rows = calendarRows();
  rows.matches[0] = { ...rows.matches[0], matchday_id: null };
  const result = mapSupabaseCalendar(rows);
  assert.equal(result.metadata.matches[0].matchdayId, null);
  assert.ok(result.metadata.notices.some((n) => n.code === "MATCHDAY_MISSING"));
});
test("adaptador: detecta calendario incompleto, números repetidos y llave contradictoria", () => {
  const missing = calendarRows();
  missing.matches.pop();
  assert.throws(
    () => mapSupabaseCalendar(missing),
    errorCode("INCOMPLETE_CALENDAR"),
  );
  const repeated = calendarRows();
  repeated.matches[1] = { ...repeated.matches[1], match_number: 1 };
  assert.throws(
    () => mapSupabaseCalendar(repeated),
    errorCode("INVALID_MATCH_NUMBER"),
  );
  const bracket = calendarRows();
  bracket.matches[18] = { ...bracket.matches[18], bracket_code: "O2" };
  assert.throws(
    () => mapSupabaseCalendar(bracket),
    errorCode("BRACKET_MAPPING_MISMATCH"),
  );
});
test("adaptador: no publica participantes eliminatorios aún no verificables", () => {
  const rows = calendarRows();
  rows.matches[18] = { ...rows.matches[18], home_team_id: rows.teams[0].id };
  const snapshot = mapSupabaseCalendar(rows);
  assert.ok(
    snapshot.metadata.notices.some(
      (n) => n.code === "KNOCKOUT_TEAMS_UNVERIFIED",
    ),
  );
  assert.equal(snapshot.data.fixtures[18].homeTeamId, undefined);
  rows.matches[18] = {
    ...rows.matches[18],
    status: "finished",
    home_score: 1,
    away_score: 0,
  };
  assert.throws(
    () => mapSupabaseCalendar(rows),
    errorCode("KNOCKOUT_TEAMS_UNVERIFIED"),
  );
});
test("adaptador: rechaza registros de otro torneo y UUID repetidos", () => {
  const rows = calendarRows();
  rows.teams[0] = { ...rows.teams[0], tournament_id: uuid(999) };
  assert.throws(() => mapSupabaseCalendar(rows), errorCode("WRONG_TOURNAMENT"));
  const repeated = calendarRows();
  repeated.matches[1] = { ...repeated.matches[1], id: repeated.matches[0].id };
  assert.throws(
    () => mapSupabaseCalendar(repeated),
    errorCode("DUPLICATE_UUID"),
  );
});
test("lectura: selecciona solo el slug autorizado y filtra todas las tablas por torneo", async () => {
  const rows = calendarRows(),
    calls: { table: ReadTable; filter: ReadFilter }[] = [];
  const reader: TournamentReader = {
    async read(table, filter) {
      calls.push({ table, filter });
      return rows[table];
    },
  };
  const result = await readSupabaseCalendar(reader);
  assert.equal(result.data.fixtures.length, 34);
  assert.deepEqual(calls[0], {
    table: "tournaments",
    filter: { column: "slug", value: "mundialito-la-bomba-2026" },
  });
  assert.ok(
    calls
      .slice(1)
      .every(
        (call) =>
          call.filter.column === "tournament_id" &&
          call.filter.value === uuid(1),
      ),
  );
  assert.deepEqual(calls.map((c) => c.table).sort(), [
    "groups",
    "matchdays",
    "matches",
    "teams",
    "tournaments",
  ]);
});
test("lectura: torneo ausente o duplicado no selecciona otro ni continúa consultando", async () => {
  for (const records of [
    [],
    [
      calendarRows().tournaments[0],
      { ...calendarRows().tournaments[0], id: uuid(999) },
    ],
  ]) {
    let calls = 0;
    const reader: TournamentReader = {
      async read() {
        calls++;
        return records;
      },
    };
    await assert.rejects(readSupabaseCalendar(reader), SupabaseReadError);
    assert.equal(calls, 1);
  }
});
test("repositorio: mantiene la API y no cae a equipos locales tras un error remoto", async () => {
  const data = mapSupabaseCalendar(calendarRows()).data,
    repository = createReadRepository(async () => data);
  assert.equal((await repository.getTeams()).length, 18);
  assert.equal((await repository.getTeamsByGroup("A")).length, 3);
  assert.equal((await repository.getTeam("la-bomba"))!.name, "La Bomba");
  assert.equal(await repository.getTeam("no-oficial"), undefined);
  const failed = createReadRepository(async () => {
    throw new SupabaseReadError("NETWORK", "Lectura fallida");
  });
  await assert.rejects(failed.getData(), errorCode("NETWORK"));
  await assert.rejects(failed.getTeams(), errorCode("NETWORK"));
});
test("configuración: sin variables conserva local; configuración parcial o privilegiada falla", () => {
  assert.deepEqual(readConfiguration({}), { mode: "local" });
  assert.deepEqual(
    readConfiguration({
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    }),
    { mode: "local" },
  );
  assert.throws(
    () =>
      readConfiguration({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      }),
    errorCode("INCOMPLETE_ENV"),
  );
  assert.throws(
    () =>
      readConfiguration({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          "sb_publishable_test_only_not_real",
      }),
    errorCode("INCOMPLETE_ENV"),
  );
  assert.throws(
    () =>
      readConfiguration({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_test_only_not_real",
      }),
    errorCode("INVALID_PUBLISHABLE_KEY"),
  );
  assert.throws(
    () =>
      readConfiguration({
        NEXT_PUBLIC_SUPABASE_URL: "http://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          "sb_publishable_test_only_not_real",
      }),
    errorCode("INVALID_URL"),
  );
});
test("transporte: bloquea escrituras, RPC, auth, tablas privadas y otros orígenes", async () => {
  let calls = 0;
  const implementation: typeof fetch = async () => {
    calls++;
    return new Response("[]");
  };
  const request = readonlyFetch("https://example.supabase.co", implementation);
  for (const method of ["POST", "PATCH", "PUT", "DELETE"])
    await assert.rejects(
      request("https://example.supabase.co/rest/v1/teams", { method }),
      errorCode("READ_ONLY_VIOLATION"),
    );
  for (const url of [
    "https://example.supabase.co/auth/v1/user",
    "https://example.supabase.co/rest/v1/rpc/test",
    "https://example.supabase.co/rest/v1/admin_users",
    "https://example.supabase.co/rest/v1/match_audit_log",
    "https://another.invalid/rest/v1/teams",
  ])
    await assert.rejects(request(url), errorCode("READ_ONLY_VIOLATION"));
  assert.equal(calls, 0);
  await request("https://example.supabase.co/rest/v1/teams");
  assert.equal(calls, 1);
});
test("SDK real con HTTP simulado: lecturas GET paginadas incluyen columnas públicas de marcadores", async () => {
  const rows = calendarRows(),
    requests: URL[] = [];
  const implementation: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push(url);
    assert.equal((init?.method ?? "GET").toUpperCase(), "GET");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    const table = url.pathname.split("/").at(-1) as ReadTable,
      all = rows[table];
    assert.ok(all);
    assert.equal(url.searchParams.get("select"), READ_COLUMNS[table]);
    if (table === "matches")
      assert.ok(url.searchParams.get("select")!.includes("home_score"));
    if (table === "tournaments")
      assert.equal(url.searchParams.get("slug"), "eq.mundialito-la-bomba-2026");
    else assert.equal(url.searchParams.get("tournament_id"), `eq.${uuid(1)}`);
    const offset = Number(url.searchParams.get("offset") ?? 0),
      page = all.slice(offset, offset + 3);
    return new Response(JSON.stringify(page), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Range": `${offset}-${offset + page.length - 1}/${all.length}`,
      },
    });
  };
  const client = createClient(
    "https://example.supabase.co",
    "sb_publishable_test_only_not_real",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: readonlyFetch("https://example.supabase.co", implementation),
      },
    },
  );
  const result = await readSupabaseCalendar(createTournamentReader(client));
  assert.equal(result.data.fixtures.length, 34);
  assert.ok(
    requests.filter((url) => url.pathname.endsWith("/matches")).length > 1,
  );
});

test("lector: errores HTTP no filtran detalles del servidor ni devuelven un conjunto vacío", async () => {
  const implementation: typeof fetch = async () =>
    new Response(
      JSON.stringify({ message: "PRIVATE_SERVER_DETAIL", code: "42501" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  const client = createClient(
    "https://example.supabase.co",
    "sb_publishable_test_only_not_real",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: readonlyFetch("https://example.supabase.co", implementation),
      },
    },
  );
  await assert.rejects(
    createTournamentReader(client).read("teams", {
      column: "tournament_id",
      value: uuid(1),
    }),
    (error) =>
      error instanceof SupabaseReadError &&
      error.code === "SUPABASE_READ_FAILED" &&
      !error.message.includes("PRIVATE_SERVER_DETAIL"),
  );
});

test("lector: cambios de recuento durante paginación impiden devolver filas parciales", async () => {
  let calls = 0;
  const implementation: typeof fetch = async () => {
    calls++;
    return new Response(JSON.stringify([calendarRows().teams[0]]), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Range": `${calls - 1}-${calls - 1}/${calls === 1 ? 2 : 3}`,
      },
    });
  };
  const client = createClient(
    "https://example.supabase.co",
    "sb_publishable_test_only_not_real",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: readonlyFetch("https://example.supabase.co", implementation),
      },
    },
  );
  await assert.rejects(
    createTournamentReader(client).read("teams", {
      column: "tournament_id",
      value: uuid(1),
    }),
    errorCode("UNSTABLE_READ"),
  );
  assert.equal(calls, 2);
});
