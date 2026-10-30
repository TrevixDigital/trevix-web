import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { calendarRows, uuid } from "./supabase-fixtures.ts";
import { adminFetch } from "../../src/lib/mundialito/admin/transport.ts";
import { readonlyFetch } from "../../src/lib/mundialito/supabase/readonly-fetch.ts";
import { validateEventValues } from "../../src/lib/mundialito/events/model.ts";
import { saveEvent } from "../../src/lib/mundialito/events/repository.ts";
import { readAdminMatches } from "../../src/lib/mundialito/matches/repository.ts";
const values = {
  team_id: uuid(100),
  player_id: uuid(900),
  event_type: "goal",
  minute: null,
  notes: null,
};
type Row = Record<string, unknown>;
function fixture() {
  const rows = calendarRows(),
    time = "2026-01-01T00:00:00Z";
  const tables: Record<string, Row[]> = {
    ...rows,
    matches: rows.matches.map((r) => ({ ...r, notes: null, updated_at: time })),
    players: [0, 1].map((i) => ({
      id: uuid(900 + i),
      tournament_id: uuid(1),
      team_id: uuid(100 + i),
      full_name: `Jugador ${i === 0 ? "Uno" : "Dos"}`,
      slug: `jugador-${i}`,
      shirt_number: null,
      position: null,
      is_active: true,
      created_at: time,
      updated_at: time,
    })),
    match_events: [],
  };
  const writes: {
    table: string;
    method: string;
    body: Row | null;
    url: URL;
  }[] = [];
  let permission: unknown = true,
    user = true,
    error: string | null = null,
    uncertain = false,
    race = false;
  const client = createClient(
    "https://events.example.test",
    "sb_publishable_test",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: adminFetch(
          "https://events.example.test",
          async (input, init) => {
            const url = new URL(String(input)),
              table = url.pathname.split("/").at(-1)!,
              method = init?.method ?? "GET";
            const json = (
              value: unknown,
              status = 200,
              headers: Record<string, string> = {},
            ) =>
              new Response(JSON.stringify(value), {
                status,
                headers: { "Content-Type": "application/json", ...headers },
              });
            if (table === "is_mundialito_admin") return json(permission);
            assert.ok(tables[table]);
            const filtered = tables[table].filter((r) =>
              [...url.searchParams].every(
                ([k, v]) => !v.startsWith("eq.") || String(r[k]) === v.slice(3),
              ),
            );
            if (method === "GET")
              return json(
                filtered.slice(
                  Number(url.searchParams.get("offset") ?? 0),
                  Number(url.searchParams.get("offset") ?? 0) +
                    Number(url.searchParams.get("limit") ?? 10000),
                ),
                200,
                {
                  "Content-Range": `0-${Math.max(0, filtered.length - 1)}/${filtered.length}`,
                },
              );
            const body = init?.body ? JSON.parse(String(init.body)) : null;
            writes.push({ table, method, body, url });
            assert.equal(
              table,
              "match_events",
              "No scores, players or audit writes",
            );
            if (error)
              return json(
                { code: error, message: "private credential sentinel" },
                403,
              );
            if (method === "POST") {
              if (tables.match_events.some((r) => r.id === body.id))
                return json({ code: "23505" }, 409);
              const r = { ...body, created_at: time, updated_at: time };
              tables.match_events.push(r);
              if (uncertain) return json({ code: "XX000" }, 500);
              if (race) return json({ code: "23505" }, 409);
              return json(r, 201);
            }
            if (!filtered[0]) return json(null);
            if (method === "PATCH") {
              Object.assign(filtered[0], body, {
                updated_at: new Date(
                  Date.parse(time) + writes.length * 1000,
                ).toISOString(),
              });
              return json(filtered[0]);
            }
            assert.equal(method, "DELETE");
            tables.match_events = tables.match_events.filter(
              (r) => r.id !== filtered[0].id,
            );
            return json(filtered[0]);
          },
        ),
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
    set error(v: string | null) {
      error = v;
    },
    set uncertain(v: boolean) {
      uncertain = v;
    },
    set race(v: boolean) {
      race = v;
    },
  };
}
function save(
  f: ReturnType<typeof fixture>,
  extra: Record<string, unknown> = {},
) {
  return saveEvent(f.client, {
    id: uuid(1000),
    matchId: uuid(401),
    mode: "create",
    values,
    confirmed: true,
    ...extra,
  });
}
test("eventos: tipos exactos, minuto 0–130, NULL y jugador obligatorio salvo autogol", () => {
  for (const type of ["goal", "own_goal", "yellow_card", "red_card"])
    assert.equal(
      validateEventValues({ ...values, event_type: type, minute: "0" }).minute,
      0,
    );
  assert.equal(
    validateEventValues({
      ...values,
      event_type: "own_goal",
      player_id: "",
      minute: "",
    }).player_id,
    null,
  );
  for (const minute of [-1, 131, 1.5, "1e2"])
    assert.throws(() => validateEventValues({ ...values, minute }));
  for (const type of ["goal", "yellow_card", "red_card"])
    assert.throws(() =>
      validateEventValues({ ...values, event_type: type, player_id: null }),
    );
  assert.throws(() =>
    validateEventValues({ ...values, event_type: "second_yellow" }),
  );
  assert.throws(() =>
    validateEventValues({ ...values, event_type: "shootout" }),
  );
});
test("eventos: altas de cuatro tipos preservan marcador y NULL de minuto", async () => {
  const f = fixture(),
    before = structuredClone(f.tables.matches);
  for (const [i, event_type] of [
    "goal",
    "own_goal",
    "yellow_card",
    "red_card",
  ].entries())
    await save(f, {
      id: uuid(1000 + i),
      values: {
        ...values,
        event_type,
        player_id: event_type === "own_goal" ? null : values.player_id,
      },
    });
  assert.equal(f.tables.match_events.length, 4);
  assert.deepEqual(f.tables.matches, before);
  assert.ok(f.tables.match_events.every((e) => e.minute === null));
});
test("eventos: reenvío, carrera PK y respuesta perdida no duplican", async () => {
  const f = fixture();
  await save(f);
  assert.equal((await save(f)).repeated, true);
  assert.equal(f.writes.length, 1);
  await assert.rejects(
    save(f, { values: { ...values, minute: 5 } }),
    /ya fue guardado/,
  );
  const race = fixture();
  race.race = true;
  assert.equal((await save(race)).repeated, true);
  assert.equal(race.tables.match_events.length, 1);
  const lost = fixture();
  lost.uncertain = true;
  await assert.rejects(save(lost));
  lost.uncertain = false;
  assert.equal((await save(lost)).repeated, true);
  assert.equal(lost.writes.length, 1);
});
test("eventos: corrección mantiene ID, partido y torneo; CAS impide sobreescritura", async () => {
  const f = fixture();
  await save(f);
  const old = structuredClone(f.tables.match_events[0]);
  await save(f, {
    mode: "edit",
    version: old.updated_at,
    values: { ...values, event_type: "own_goal", player_id: null, minute: 130 },
  });
  for (const key of ["id", "match_id", "tournament_id", "created_at"])
    assert.equal(f.tables.match_events[0][key], old[key]);
  assert.equal(f.tables.match_events[0].event_type, "own_goal");
  assert.equal(f.tables.match_events[0].minute, 130);
  await assert.rejects(
    save(f, {
      mode: "edit",
      version: old.updated_at,
      values: { ...values, minute: 4 },
    }),
    /cambió/,
  );
  assert.ok(!Object.hasOwn(f.writes[1].body!, "match_id"));
});
test("eventos: elimina con confirmación y versión sin tocar jugador ni partido", async () => {
  const f = fixture();
  await save(f);
  const before = structuredClone(f.tables.players),
    version = f.tables.match_events[0].updated_at;
  await assert.rejects(save(f, { mode: "delete", version, confirmed: false }));
  await save(f, { mode: "delete", version });
  assert.equal(f.tables.match_events.length, 0);
  assert.deepEqual(f.tables.players, before);
  assert.equal((await save(f, { mode: "delete", version })).repeated, true);
  assert.equal(f.writes.filter((w) => w.method === "DELETE").length, 1);
});
test("eventos: autorización, pertenencia y ámbito se verifican en servidor", async () => {
  const f = fixture();
  f.user = false;
  await assert.rejects(save(f));
  f.user = true;
  for (const p of [false, null, "true"]) {
    f.permission = p;
    await assert.rejects(save(f));
  }
  f.permission = true;
  await assert.rejects(
    save(f, { values: { ...values, player_id: uuid(901) } }),
    /fuera/,
  );
  await assert.rejects(
    save(f, { values: { ...values, team_id: uuid(110) } }),
    /fuera/,
  );
  await assert.rejects(save(f, { matchId: uuid(9999) }));
  assert.equal(f.writes.length, 0);
});
test("eventos: errores RLS/triggers no filtran mensajes internos ni declaran éxito", async () => {
  const f = fixture();
  for (const error of ["42501", "23503", "P0001"]) {
    f.error = error;
    await assert.rejects(
      save(f),
      (e) => e instanceof Error && !e.message.includes("sentinel"),
    );
  }
  assert.equal(f.tables.match_events.length, 0);
});
test("eventos: goles registrados, autogoles anónimos y tarjetas no certficadas", async () => {
  const f = fixture();
  f.tables.matches[0] = {
    ...f.tables.matches[0],
    status: "finished",
    home_score: 1,
    away_score: 0,
  };
  await save(f);
  await save(f, {
    id: uuid(1001),
    values: { ...values, event_type: "own_goal", player_id: null },
  });
  for (const [i, event_type] of [
    "yellow_card",
    "yellow_card",
    "red_card",
  ].entries())
    await save(f, {
      id: uuid(1010 + i),
      values: { ...values, event_type, minute: i },
    });
  const data = await readAdminMatches(f.client, true),
    stat = data.snapshot.statistics;
  assert.equal(stat.recordedScorers[0].goals, 1);
  assert.equal(stat.unattributedOwnGoals, 1);
  assert.equal(stat.scorers.length, 0);
  assert.equal(stat.eventComplete, false);
  const p = stat.playerRows.find((p) => p.player.id === uuid(900))!;
  assert.equal(p.yellows, 2);
  assert.equal(p.reds, 1);
  assert.equal(p.discipline, null);
  assert.equal(data.scoreWarnings!.length, 1);
  assert.equal(f.tables.matches[0].away_score, 0);
  assert.equal(data.data.disciplineCoverage.length, 0);
});
test("eventos: sin eventos no se infiere acta completa ni goles ficticios", async () => {
  const f = fixture();
  f.tables.matches[0] = {
    ...f.tables.matches[0],
    status: "finished",
    home_score: 3,
    away_score: 0,
  };
  const data = await readAdminMatches(f.client, true);
  assert.equal(data.events!.length, 0);
  assert.equal(data.data.eventCoverage.length, 0);
  assert.equal(data.scoreWarnings!.length, 1);
  assert.equal(data.snapshot.statistics.recordedScorers.length, 0);
});
test("eventos: transporte privado admite solo campos/ámbito previstos; público nunca escribe", async () => {
  let calls = 0;
  const host = "https://events.example.test",
    f = adminFetch(host, async () => {
      calls++;
      return new Response("null");
    });
  const scope = `?id=eq.${uuid(1000)}&tournament_id=eq.${uuid(1)}&match_id=eq.${uuid(401)}&team_id=eq.${uuid(100)}&updated_at=eq.2026-01-01`;
  await f(host + "/rest/v1/match_events" + scope, {
    method: "PATCH",
    body: JSON.stringify({ minute: 3 }),
  });
  for (const [suffix, method, body] of [
    [scope, "PATCH", { match_id: uuid(402) }],
    ["", "DELETE", undefined],
    ["", "POST", [{ ...values, id: uuid(1000) }]],
    [scope, "PATCH", { dismissal_cause: "direct" }],
  ] as const)
    await assert.rejects(
      f(host + "/rest/v1/match_events" + suffix, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
  const publicRead = readonlyFetch(host, async () => {
    calls++;
    return new Response("[]");
  });
  await assert.rejects(
    publicRead(host + "/rest/v1/match_events", { method: "POST", body: "{}" }),
  );
  assert.equal(calls, 1);
});
