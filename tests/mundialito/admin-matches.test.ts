import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { calendarRows, uuid } from "./supabase-fixtures.ts";
import { adminFetch } from "../../src/lib/mundialito/admin/transport.ts";
import {
  validateMatchValues,
  fromLocalMatchDate,
  localMatchDate,
  filterMatches,
} from "../../src/lib/mundialito/matches/model.ts";
import {
  readAdminMatches,
  saveAdminMatch,
} from "../../src/lib/mundialito/matches/repository.ts";
import { mapSupabaseCalendar } from "../../src/lib/mundialito/adapters/supabase-calendar.ts";
import { calculateTournament } from "../../src/lib/mundialito/engine/tournament.ts";
import {
  knockoutSyncPlan,
  syncConfirmedParticipants,
} from "../../src/lib/mundialito/matches/sync.ts";
const empty = {
  scheduled_at: null,
  venue: null,
  notes: null,
  status: "scheduled",
  home_score: null,
  away_score: null,
  home_penalties: null,
  away_penalties: null,
};
type Row = Record<string, unknown>;
function fixture() {
  const rows = calendarRows();
  const tables: Record<string, Row[]> = {
    ...rows,
    matches: rows.matches.map((r) => ({
      ...r,
      notes: null,
      updated_at: "2026-01-01T00:00:00Z",
    })),
    match_audit_log: [],
    players: [],
    match_events: [],
  };
  const writes: { url: URL; body: Row }[] = [];
  let permission: unknown = true,
    user = true,
    writeError: string | null = null,
    auditError = false;
  const client = createClient(
    "https://match.example.test",
    "sb_publishable_test",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: adminFetch("https://match.example.test", async (input, init) => {
          const url = new URL(String(input)),
            method = init?.method ?? "GET",
            table = url.pathname.split("/").at(-1)!;
          const json = (
            data: unknown,
            status = 200,
            headers: Record<string, string> = {},
          ) =>
            new Response(JSON.stringify(data), {
              status,
              headers: { "Content-Type": "application/json", ...headers },
            });
          if (table === "is_mundialito_admin") return json(permission);
          if (table === "match_audit_log" && auditError)
            return json({ code: "42501", message: "private" }, 403);
          const filtered = tables[table].filter((r) =>
            [...url.searchParams].every(([key, v]) => {
              if (!v.startsWith("eq.")) return true;
              const [field, path] = key.split("->>");
              return (
                String(path ? (r[field] as Row)?.[path] : r[field]) ===
                v.slice(3)
              );
            }),
          );
          if (method === "GET")
            return json(
              filtered.slice(
                Number(url.searchParams.get("offset") ?? 0),
                Number(url.searchParams.get("offset") ?? 0) +
                  Number(url.searchParams.get("limit") ?? 1000),
              ),
              200,
              {
                "Content-Range": `0-${Math.max(0, filtered.length - 1)}/${filtered.length}`,
              },
            );
          assert.equal(method, "PATCH");
          assert.equal(table, "matches");
          const body = JSON.parse(String(init?.body));
          writes.push({ url, body });
          if (writeError)
            return json(
              { code: writeError, message: "sensitive trigger detail" },
              400,
            );
          if (!filtered[0]) return json(null);
          const before = structuredClone(filtered[0]);
          Object.assign(filtered[0], body, {
            updated_at: new Date(
              Date.parse("2026-01-02T00:00:00Z") + writes.length,
            ).toISOString(),
          });
          tables.match_audit_log.push({
            match_id: before.id,
            changed_by: uuid(800),
            action: "UPDATE",
            old_data: before,
            new_data: structuredClone(filtered[0]),
          });
          return json(filtered[0]);
        }),
      },
    },
  );
  client.auth.getUser = async () =>
    ({
      data: { user: user ? { id: uuid(800) } : null },
      error: null,
    }) as unknown as Awaited<ReturnType<typeof client.auth.getUser>>;
  return {
    client,
    tables,
    writes,
    set permission(v: unknown) {
      permission = v;
    },
    set user(v: boolean) {
      user = v;
    },
    set writeError(v: string | null) {
      writeError = v;
    },
    set auditError(v: boolean) {
      auditError = v;
    },
  };
}
function save(
  f: ReturnType<typeof fixture>,
  values: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) {
  return saveAdminMatch(f.client, {
    id: uuid(401),
    version: "2026-01-01T00:00:00Z",
    values: { ...empty, ...values },
    confirmed: true,
    ...extra,
  });
}
test("partidos: NULL, estados, enteros, marcadores completos y zonas horarias", () => {
  assert.equal(validateMatchValues(empty, "groups").home_score, null);
  for (const status of [
    "scheduled",
    "live",
    "finished",
    "postponed",
    "cancelled",
    "suspended",
  ])
    assert.equal(
      validateMatchValues(
        { ...empty, status, home_score: 0, away_score: 1 },
        "groups",
      ).status,
      status,
    );
  for (const value of [-1, 1.5, "1e2", 2147483648])
    assert.throws(() =>
      validateMatchValues(
        { ...empty, home_score: value, away_score: 0 },
        "groups",
      ),
    );
  assert.throws(() =>
    validateMatchValues({ ...empty, status: "finished" }, "groups"),
  );
  assert.throws(() =>
    validateMatchValues({ ...empty, home_score: 0 }, "groups"),
  );
  assert.throws(() =>
    validateMatchValues({ ...empty, status: "inventado" }, "groups"),
  );
  assert.equal(
    fromLocalMatchDate("2026-11-01", "14:30"),
    "2026-11-01T20:30:00.000Z",
  );
  assert.deepEqual(localMatchDate("2026-11-01T20:30:00Z"), {
    date: "2026-11-01",
    time: "14:30",
  });
  assert.throws(() => fromLocalMatchDate("2026-02-30", "14:00"));
  assert.throws(() => fromLocalMatchDate("2026-11-01", ""));
  assert.equal(fromLocalMatchDate("", ""), null);
});
test("partidos: filtros por fase/jornada/estado y búsqueda con tildes", () => {
  const rows = [
    {
      phase: "groups",
      dayId: "j1",
      status: "scheduled",
      home: "San Julián",
      away: "La Bomba",
    },
    {
      phase: "groups",
      dayId: "j2",
      status: "finished",
      home: "Sagrado",
      away: "Villa Hermosa",
    },
    {
      phase: "final",
      dayId: null,
      status: "scheduled",
      home: "Ganador S1",
      away: "Ganador S2",
    },
  ];
  assert.equal(
    filterMatches(rows, {
      phase: "groups",
      day: "j1",
      status: "",
      search: "JULIAN",
    }).length,
    1,
  );
  assert.equal(
    filterMatches(rows, {
      phase: "groups",
      day: "",
      status: "finished",
      search: "villa",
    }).length,
    1,
  );
  assert.equal(
    filterMatches(rows, {
      phase: "groups",
      day: "j1",
      status: "",
      search: "Sagrado",
    }).length,
    0,
  );
});
test("cruces: calcula ocho candidatos pero no persiste clasificación sin aprobación y evidencia", async () => {
  const f = fixture();
  f.tables.matches = f.tables.matches.map((r, i) =>
    i < 18
      ? {
          ...r,
          status: "finished",
          home_score:
            i % 3 === 0
              ? Math.floor(i / 3) + 1
              : i % 3 === 1
                ? Math.floor(i / 3) + 2
                : 1,
          away_score: 0,
        }
      : r,
  );
  const plan = knockoutSyncPlan(await readAdminMatches(f.client, true));
  assert.equal(plan.changes.length, 8);
  const result = await syncConfirmedParticipants(f.client);
  assert.equal(result.assigned.length, 0);
  assert.match(result.warnings.join(" "),/aprobación/);
  assert.equal(f.tables.match_audit_log.length, 0);
  await syncConfirmedParticipants(f.client);
  assert.equal(f.writes.length, 0);
});
test("cruces: asignación segura no llama RPC ni escribe con publicación desactivada", async () => {
  const f = fixture();
  await assert.rejects(syncConfirmedParticipants(f.client,{sportingBasis:"no-autorizado"}),/desactivada/);
  assert.equal(f.writes.length,0);
});
test("cruces: no inicializa proyecciones ni sobrescribe equipos o marcadores existentes", async () => {
  const f = fixture();
  assert.equal(
    knockoutSyncPlan(await readAdminMatches(f.client, true)).changes.length,
    0,
  );
  f.tables.matches = f.tables.matches.map((r, i) =>
    i < 18
      ? {
          ...r,
          status: "finished",
          home_score:
            i % 3 === 0
              ? Math.floor(i / 3) + 1
              : i % 3 === 1
                ? Math.floor(i / 3) + 2
                : 1,
          away_score: 0,
        }
      : r,
  );
  f.tables.matches[22].home_team_id = uuid(100);
  f.tables.matches[23].home_score = 0;
  const plan = knockoutSyncPlan(await readAdminMatches(f.client, true));
  assert.ok(plan.conflicts.includes("O5"));
  assert.ok(plan.conflicts.includes("O6"));
  assert.ok(
    !plan.changes.some((c) => c.localId === "O5" || c.localId === "O6"),
  );
  assert.equal(f.writes.length, 0);
});
test("partidos: resultado eliminatorio real pasa por adaptador y ganador de tanda avanza", () => {
  const rows = calendarRows();
  // Strictly separated synthetic standings: no cards/draw decision required for this fixture.
  rows.matches = rows.matches.map((r, i) =>
    i < 18
      ? {
          ...r,
          status: "finished",
          home_score:
            i % 3 === 0
              ? Math.floor(i / 3) + 1
              : i % 3 === 1
                ? Math.floor(i / 3) + 2
                : 1,
          away_score: 0,
        }
      : r,
  );
  let snapshot = calculateTournament(mapSupabaseCalendar(rows).data);
  const match = snapshot.bracket.find((m) => m.id === "O5")!;
  assert.equal(match.state, "confirmed");
  const home = rows.teams.find((t) => t.slug === match.home.teamId)!.id,
    away = rows.teams.find((t) => t.slug === match.away.teamId)!.id;
  rows.matches[22] = {
    ...rows.matches[22],
    home_team_id: home,
    away_team_id: away,
    status: "finished",
    home_score: 1,
    away_score: 1,
    home_penalties: 3,
    away_penalties: 4,
  };
  snapshot = calculateTournament(mapSupabaseCalendar(rows).data);
  assert.equal(
    snapshot.bracket.find((m) => m.id === "O5")!.winnerId,
    match.away.teamId,
  );
  assert.equal(
    snapshot.bracket.find((m) => m.id === "C1")!.away.teamId,
    match.away.teamId,
  );
  assert.equal(snapshot.data.events.length, 0);
  assert.equal(snapshot.statistics.scorers.length, 0);
  rows.matches[22] = {
    ...rows.matches[22],
    home_penalties: null,
    away_penalties: null,
  };
  const pending = calculateTournament(mapSupabaseCalendar(rows).data);
  assert.equal(pending.bracket.find((m) => m.id === "O5")!.winnerId, undefined);
  assert.equal(
    pending.bracket.find((m) => m.id === "C1")!.away.teamId,
    undefined,
  );
});
test("partidos: penales separados, solo eliminatorios finalizados y empatados", () => {
  const p = {
    ...empty,
    status: "finished",
    home_score: 1,
    away_score: 1,
    home_penalties: 4,
    away_penalties: 3,
  };
  assert.equal(validateMatchValues(p, "round_of_16").home_score, 1);
  for (const changed of [
    { away_penalties: null },
    { away_penalties: 4 },
    { away_score: 2 },
    { status: "live" },
  ])
    assert.throws(() =>
      validateMatchValues({ ...p, ...changed }, "round_of_16"),
    );
  assert.throws(() => validateMatchValues(p, "groups"));
  assert.equal(
    validateMatchValues(
      { ...p, home_penalties: null, away_penalties: null },
      "round_of_16",
    ).home_penalties,
    null,
  );
});
test("partidos: lee 34 con fase, jornada, grupo y UUID originales", async () => {
  const f = fixture(),
    data = await readAdminMatches(f.client);
  assert.equal(data.records.length, 34);
  assert.equal(data.metadata.matches[0].id, uuid(401));
  assert.equal(data.metadata.matches[0].localStage, "groups");
  assert.ok(data.metadata.matches[0].matchdayId);
  assert.ok(data.metadata.matches[0].groupId);
});
test("partidos: UPDATE de fecha/sede con CAS y auditoría existente, sin cambiar identidades", async () => {
  const f = fixture(),
    before = structuredClone(f.tables.matches[0]);
  const r = await save(f, {
    scheduled_at: "2026-11-01T14:30:00-06:00",
    venue: "Sede oficial",
    notes: "Observación",
    team_id: uuid(999),
    phase: "final",
  });
  assert.equal(r.auditVerified, true);
  assert.equal(f.writes.length, 1);
  assert.equal(r.values.scheduled_at, "2026-11-01T20:30:00.000Z");
  for (const key of [
    "id",
    "home_team_id",
    "away_team_id",
    "group_id",
    "phase",
    "match_number",
    "home_source",
    "away_source",
  ])
    assert.equal(f.tables.matches[0][key], before[key]);
  assert.equal(
    f.writes[0].url.searchParams.get("updated_at"),
    `eq.${before.updated_at}`,
  );
  assert.ok(!Object.hasOwn(f.writes[0].body, "updated_at"));
  assert.equal(f.tables.match_audit_log.length, 1);
});
test("partidos: editar sede conserva segundos del horario original no editables en el formulario", async () => {
  const f = fixture();
  f.tables.matches[0].scheduled_at = "2026-11-01T20:30:45Z";
  const r = await save(f, {
    scheduled_at: "2026-11-01T20:30:00Z",
    venue: "Sede confirmada",
  });
  assert.equal(r.values.scheduled_at, "2026-11-01T20:30:45Z");
});

test("resultado: solo cambia marcador/estado y conserva fecha con microsegundos sin reescribirla",async()=>{
  const f=fixture(),original="2026-10-24T15:00:45.123456+00:00";
  f.tables.matches[0]={...f.tables.matches[0],scheduled_at:original,venue:"La Bomba",notes:"Acta existente"};
  const result=await save(f,{scheduled_at:"2026-10-24T15:00:00Z",venue:"La Bomba",notes:"Acta existente",status:"finished",home_score:3,away_score:3});
  assert.equal(result.auditVerified,true);assert.equal(result.values.scheduled_at,original);
  assert.equal(f.tables.matches[0].scheduled_at,original);
  assert.deepEqual(f.writes[0].body,{status:"finished",home_score:3,away_score:3});
});
test("partidos: no corrige una fase anterior invalidando participantes de resultados posteriores", async () => {
  const f = fixture();
  f.tables.matches = f.tables.matches.map((r, i) =>
    i < 18
      ? {
          ...r,
          status: "finished",
          home_score:
            i % 3 === 0
              ? Math.floor(i / 3) + 1
              : i % 3 === 1
                ? Math.floor(i / 3) + 2
                : 1,
          away_score: 0,
        }
      : r,
  );
  const data = await readAdminMatches(f.client),
    b = data.snapshot.bracket.find((m) => m.id === "O5")!;
  f.tables.matches[22] = {
    ...f.tables.matches[22],
    status: "finished",
    home_team_id: data.metadata.teams.find(
      (t) => t.localSlug === b.home.teamId,
    )!.id,
    away_team_id: data.metadata.teams.find(
      (t) => t.localSlug === b.away.teamId,
    )!.id,
    home_score: 2,
    away_score: 0,
  };
  await assert.rejects(
    save(
      f,
      { status: "finished", home_score: 0, away_score: 99 },
      { id: uuid(413) },
    ),
    /incompatible/,
  );
  assert.equal(f.writes.length, 0);
});
test("partidos: guardar resultado final alimenta posiciones; live no suma puntos", async () => {
  const f = fixture();
  await save(f, { status: "finished", home_score: 2, away_score: 0 });
  const data = await readAdminMatches(f.client),
    group = data.snapshot.groups.find((g) => g.group === "A")!;
  const home = data.data.fixtures[0].homeTeamId;
  assert.equal(group.rows.find((r) => r.team.slug === home)!.stats.points, 3);
  assert.equal(data.data.results[0].homeGoals, 2);
  assert.equal(data.data.eventCoverage.length, 0);
  assert.equal(data.data.events.length, 0);
  const live = fixture();
  await save(live, { status: "live", home_score: 2, away_score: 0 });
  const l = await readAdminMatches(live.client);
  assert.ok(
    l.snapshot.groups.every((g) => g.rows.every((r) => r.stats.played === 0)),
  );
});
test("partidos: repetición idéntica no genera UPDATE ni auditoría duplicada", async () => {
  const f = fixture(),
    v = { status: "finished", home_score: 0, away_score: 0 };
  await save(f, v);
  const second = await save(f, v);
  assert.equal(second.repeated, true);
  assert.equal(f.writes.length, 1);
  assert.equal(f.tables.match_audit_log.length, 1);
  await assert.rejects(save(f, { ...v, home_score: 1 }), /Otro guardado/);
});
test("partidos: sin sesión/permiso o confirmación, y UUID ajeno, no escriben", async () => {
  const f = fixture();
  f.user = false;
  await assert.rejects(save(f, { venue: "Otra" }));
  f.user = true;
  for (const p of [false, null, "true"]) {
    f.permission = p;
    await assert.rejects(save(f, { venue: "Otra" }));
  }
  f.permission = true;
  await assert.rejects(
    save(f, { venue: "Otra" }, { confirmed: false }),
    /Confirma/,
  );
  await assert.rejects(
    save(f, { venue: "Otra" }, { id: uuid(9999) }),
    /no disponible/,
  );
  assert.equal(f.writes.length, 0);
});
test("partidos: trigger que rechaza revierte; auditoría ilegible advierte sin repetir escritura", async () => {
  const f = fixture();
  f.writeError = "P0001";
  await assert.rejects(
    save(f, { venue: "Otra" }),
    (e) =>
      e instanceof Error &&
      e.message.includes("P0001") &&
      !e.message.includes("sensitive"),
  );
  assert.equal(f.tables.matches[0].venue, null);
  assert.equal(f.tables.match_audit_log.length, 0);
  const other = fixture();
  other.auditError = true;
  const r = await save(other, { venue: "Otra" });
  assert.equal(r.auditVerified, false);
  assert.match(r.warning, /está guardado/);
  assert.equal(other.writes.length, 1);
});
test("partidos: estados sin resultado no publican ceros, finales NULL se rechazan", () => {
  for (const status of ["scheduled", "postponed", "cancelled", "suspended"]) {
    const rows = calendarRows();
    rows.matches[0] = {
      ...rows.matches[0],
      status,
      home_score: 0,
      away_score: 0,
    };
    assert.equal(mapSupabaseCalendar(rows).data.results.length, 0);
  }
  const rows = calendarRows();
  rows.matches[0] = { ...rows.matches[0], status: "finished" };
  assert.throws(() => mapSupabaseCalendar(rows), /NULL/);
});
test("partidos: adaptador integra grupos reales sin inventar goleadores ni disciplina", () => {
  const rows = calendarRows();
  rows.matches[0] = {
    ...rows.matches[0],
    status: "finished",
    home_score: 3,
    away_score: 1,
  };
  const result = calculateTournament(mapSupabaseCalendar(rows).data);
  assert.equal(
    result.groups[0].rows.find((r) => r.stats.points === 3)!.stats.gf,
    3,
  );
  assert.equal(result.statistics.scorers.length, 0);
  assert.ok(result.groups[0].rows.some((r) => r.stats.discipline === null));
});
test("partidos: transporte bloquea INSERT/DELETE, cambios de equipos, PATCH sin versión y auditoría manual", async () => {
  let calls = 0;
  const guarded = adminFetch("https://match.example.test", async () => {
    calls++;
    return new Response("null");
  });
  const base = "https://match.example.test/rest/v1/",
    scope = `?id=eq.${uuid(401)}&tournament_id=eq.${uuid(1)}&updated_at=eq.2026-01-01`;
  await guarded(base + "matches" + scope, {
    method: "PATCH",
    body: JSON.stringify({ home_score: 0, away_score: 0 }),
  });
  for (const [table, method, body] of [
    ["matches", "POST", {}],
    ["matches" + scope, "DELETE", {}],
    ["matches" + scope, "PATCH", { home_team_id: uuid(999) }],
    ["matches", "PATCH", { venue: "Otra" }],
    ["match_audit_log", "POST", {}],
  ] as const)
    await assert.rejects(
      guarded(base + table, { method, body: JSON.stringify(body) }),
    );
  assert.equal(calls, 1);
});
