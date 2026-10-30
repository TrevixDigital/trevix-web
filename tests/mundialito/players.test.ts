import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { calendarRows, uuid } from "./supabase-fixtures.ts";
import { adminFetch } from "../../src/lib/mundialito/admin/transport.ts";
import {
  readPlayer,
  readPlayers,
  readPublicPlayerRecord,
  readRosterContext,
  saveRosterPlayer,
} from "../../src/lib/mundialito/players/repository.ts";
import {
  decodePlayer,
  duplicateWarnings,
  makePlayerSlug,
  publicPlayerSlug,
  validatePlayerValues,
  type PlayerValues,
} from "../../src/lib/mundialito/players/model.ts";

const host = "https://roster.example.test";
const values: PlayerValues = {
  fullName: "Juan Peres",
  shirtNumber: null,
  position: null,
  active: true,
};
type Row = Record<string, unknown>;
function row(n = 900, extra: Row = {}): Row {
  return {
    id: uuid(n),
    tournament_id: uuid(1),
    team_id: uuid(100),
    full_name: values.fullName,
    slug: makePlayerSlug(values.fullName, uuid(n)),
    shirt_number: null,
    position: null,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...extra,
  };
}
function fixture(initial: Row[] = []) {
  const tables: Record<string, Row[]> = {
    ...calendarRows(),
    players: structuredClone(initial),
  };
  const requests: { url: URL; method: string; body: Row | null }[] = [];
  let permission: unknown = true,
    writeError: string | null = null,
    partial = false,
    race = false;
  const implementation: typeof fetch = async (input, init) => {
    const url = new URL(String(input)),
      method = init?.method ?? "GET",
      body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, body });
    const json = (
      data: unknown,
      status = 200,
      headers: Record<string, string> = {},
    ) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", ...headers },
      });
    if (url.pathname.endsWith("is_mundialito_admin")) return json(permission);
    const table = url.pathname.split("/").at(-1)!;
    assert.ok(tables[table], `Unexpected table ${table}`);
    const filtered = tables[table].filter((r) =>
      [...url.searchParams].every(
        ([k, v]) => !v.startsWith("eq.") || String(r[k]) === v.slice(3),
      ),
    );
    if (method === "GET") {
      const offset = Number(url.searchParams.get("offset") ?? 0),
        limit = Number(url.searchParams.get("limit") ?? 10000);
      const data = filtered.slice(offset, offset + limit);
      return json(partial && table === "players" ? [] : data, 200, {
        "Content-Range": `0-${Math.max(0, data.length - 1)}/${filtered.length}`,
      });
    }
    assert.equal(table, "players");
    if (writeError)
      return json(
        { code: writeError, message: "sensitive backend detail" },
        403,
      );
    if (method === "POST") {
      if (
        tables.players.some(
          (r) =>
            r.id === body.id ||
            (r.team_id === body.team_id && r.slug === body.slug),
        )
      )
        return json({ code: "23505" }, 409);
      const created = { ...row(), ...body };
      tables.players.push(created);
      if (race) return json({ code: "23505" }, 409);
      return json(created, 201);
    }
    assert.equal(method, "PATCH");
    if (race) return json(null);
    assert.ok(filtered.length <= 1);
    if (filtered[0]) Object.assign(filtered[0], body);
    return json(filtered[0] ?? null);
  };
  const client = createClient(host, "sb_publishable_fixture", {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: adminFetch(host, implementation) },
  });
  // Only Auth identity is stubbed; all PostgREST queries use the real SDK and guarded transport.
  client.auth.getUser = async () =>
    ({ data: { user: { id: uuid(800) } }, error: null }) as Awaited<
      ReturnType<typeof client.auth.getUser>
    >;
  return {
    client,
    tables,
    requests,
    set permission(v: unknown) {
      permission = v;
    },
    set writeError(v: string | null) {
      writeError = v;
    },
    set partial(v: boolean) {
      partial = v;
    },
    set race(v: boolean) {
      race = v;
    },
  };
}
async function command(
  f: ReturnType<typeof fixture>,
  extra: Record<string, unknown> = {},
) {
  const context = await readRosterContext(f.client);
  return saveRosterPlayer(f.client, {
    teamSlug: context.teams[0].slug,
    id: uuid(900),
    mode: "create",
    values,
    ...extra,
  });
}

test("players integral: cambios sucesivos conservan identidad y relaciones de goles/tarjetas", async () => {
  const f = fixture();
  let result = await command(f);
  const identity = {
    id: result.player.id,
    teamId: result.player.teamId,
    tournamentId: result.player.tournamentId,
    slug: result.player.slug,
  };
  // Foreign keys are dereferenced after each actual mocked PATCH, not copied/recreated.
  const events = [
    { type: "goal", player_id: result.player.id },
    { type: "yellow_card", player_id: result.player.id },
    { type: "red_card", player_id: result.player.id },
  ];
  let current: PlayerValues = { ...values };
  for (const change of [
    { fullName: "Juan Pérez" },
    { shirtNumber: 7 },
    { shirtNumber: 99 },
    { position: "defender" as const },
    { position: "midfielder" as const },
    { active: false },
    { active: true },
    { shirtNumber: null, position: null },
  ]) {
    current = { ...current, ...change };
    result = await command(f, {
      mode: "edit",
      version: result.player.updatedAt,
      values: current,
    });
    assert.deepEqual(
      {
        id: result.player.id,
        teamId: result.player.teamId,
        tournamentId: result.player.tournamentId,
        slug: result.player.slug,
      },
      identity,
    );
    assert.equal(f.tables.players.length, 1);
    for (const event of events)
      assert.equal(
        f.tables.players.find((p) => p.id === event.player_id)!.full_name,
        current.fullName,
      );
  }
  assert.equal(f.requests.filter((r) => r.method === "POST").length, 1);
  assert.equal(f.requests.filter((r) => r.method === "PATCH").length, 8);
  assert.equal(
    f.requests.some(
      (r) => r.method === "DELETE" || r.url.pathname.endsWith("match_events"),
    ),
    false,
  );
});
test("players integral: slug conflictivo no provoca INSERT ni cambia una ficha ajena", async () => {
  const f = fixture([
    row(901, {
      slug: makePlayerSlug(values.fullName, uuid(900)),
      full_name: "Otra Persona",
    }),
  ]);
  await assert.rejects(command(f), /slug ya está ocupado/);
  assert.equal(
    f.requests.some((r) => r.method !== "GET"),
    false,
  );
  assert.equal(f.tables.players[0].full_name, "Otra Persona");
});
test("players integral: parámetros adicionales del navegador no cambian equipo ni torneo", async () => {
  const f = fixture();
  await command(f, {
    team_id: uuid(101),
    tournament_id: uuid(999),
    values: {
      ...values,
      team_id: uuid(101),
      tournament_id: uuid(999),
      slug: "manipulado",
    },
  });
  assert.equal(f.tables.players[0].team_id, uuid(100));
  assert.equal(f.tables.players[0].tournament_id, uuid(1));
  assert.notEqual(f.tables.players[0].slug, "manipulado");
  const edited = await command(f, {
    mode: "edit",
    teamSlug: (await readRosterContext(f.client)).teams[1].slug,
    version: f.tables.players[0].updated_at,
  }).catch((e) => e);
  assert.ok(edited instanceof Error);
  assert.equal(
    f.requests.some((r) => r.method === "PATCH"),
    false,
  );
});
test("players integral: creación con dorsal válido y rechazo de nombre vacío antes de escribir", async () => {
  const f = fixture();
  assert.equal(
    (
      await command(f, {
        values: { ...values, shirtNumber: 1, position: "goalkeeper" },
      })
    ).player.shirtNumber,
    1,
  );
  const invalid = fixture();
  await assert.rejects(
    command(invalid, { values: { ...values, fullName: "  " } }),
    /nombre/,
  );
  assert.equal(
    invalid.requests.some((r) => r.method !== "GET"),
    false,
  );
});

test("players: NULL opcionales se conservan y posiciones españolas no se guardan", () => {
  assert.deepEqual(
    validatePlayerValues({
      ...values,
      fullName: "  Juan   Pérez ",
      shirtNumber: "",
      position: "",
    }),
    { ...values, fullName: "Juan Pérez" },
  );
  for (const shirtNumber of [0, 100, 1.5, "1e1", "-2", undefined])
    assert.throws(() => validatePlayerValues({ ...values, shirtNumber }));
  for (const position of ["Portero", "GOALKEEPER", "striker", undefined])
    assert.throws(() => validatePlayerValues({ ...values, position }));
  for (const position of [
    "goalkeeper",
    "defender",
    "midfielder",
    "forward",
    null,
  ])
    assert.equal(
      validatePlayerValues({ ...values, position }).position,
      position,
    );
  for (const fullName of [" ", "J", "a\0b"])
    assert.throws(() => validatePlayerValues({ ...values, fullName }));
  assert.throws(() => validatePlayerValues({ ...values, active: "true" }));
});
test("players: catálogo exige torneo exacto, 18 equipos y seis grupos oficiales", async () => {
  const f = fixture();
  const c = await readRosterContext(f.client);
  assert.equal(c.teams.length, 18);
  assert.equal(new Set(c.teams.map((t) => t.group)).size, 6);
  f.tables.teams.pop();
  await assert.rejects(readRosterContext(f.client), /18 equipos/);
  const duplicate = fixture();
  duplicate.tables.teams[1].id = duplicate.tables.teams[0].id;
  await assert.rejects(
    readRosterContext(duplicate.client),
    /catálogo recibido/,
  );
  const other = fixture();
  other.tables.tournaments[0].slug = "otro";
  await assert.rejects(readRosterContext(other.client), /torneo oficial/);
});
test("players: fichaje usa UUID reales, NULL, sesión y solo INSERT players", async () => {
  const f = fixture();
  const saved = await command(f);
  assert.equal(saved.player.id, uuid(900));
  assert.equal(saved.player.shirtNumber, null);
  assert.equal(saved.player.position, null);
  const write = f.requests.find((r) => r.method === "POST")!;
  assert.equal(write.body!.team_id, uuid(100));
  assert.equal(write.body!.tournament_id, uuid(1));
  assert.equal(f.tables.players.length, 1);
  assert.ok(
    f.requests.some((r) => r.url.pathname.endsWith("is_mundialito_admin")),
  );
  assert.deepEqual(
    f.requests.filter((r) => r.method !== "GET").map((r) => r.url.pathname),
    ["/rest/v1/players"],
  );
});
test("players: Juan Peres → Juan Pérez conserva ID, FKs, slug e historial", async () => {
  const original = row();
  const f = fixture([original]);
  const history = [{ player_id: uuid(900), type: "goal" }];
  const saved = await command(f, {
    mode: "edit",
    version: original.updated_at,
    values: {
      ...values,
      fullName: "Juan Pérez",
      shirtNumber: 7,
      position: "forward",
      active: false,
    },
  });
  assert.equal(saved.player.id, original.id);
  assert.equal(saved.player.slug, original.slug);
  assert.equal(saved.player.teamId, original.team_id);
  assert.equal(saved.player.fullName, "Juan Pérez");
  assert.equal(saved.player.active, false);
  const patch = f.requests.find((r) => r.method === "PATCH")!;
  assert.deepEqual(Object.keys(patch.body!).sort(), [
    "full_name",
    "is_active",
    "position",
    "shirt_number",
    "updated_at",
  ]);
  for (const key of ["id", "team_id", "tournament_id", "updated_at"])
    assert.equal(patch.url.searchParams.get(key), `eq.${original[key]}`);
  assert.equal(f.tables.players.length, 1);
  assert.equal(history[0].player_id, saved.player.id);
  assert.equal(
    publicPlayerSlug(saved.player),
    publicPlayerSlug(decodePlayer(original, await readRosterContext(f.client))),
  );
});
test("players: reenvío y carrera del mismo fichaje no duplican registros", async () => {
  const f = fixture();
  await command(f);
  assert.equal((await command(f)).repeated, true);
  assert.equal(f.tables.players.length, 1);
  assert.equal(f.requests.filter((r) => r.method === "POST").length, 1);
  await assert.rejects(
    command(f, { values: { ...values, fullName: "Otro nombre" } }),
    /ya fue recibido/,
  );
  const race = fixture();
  race.race = true;
  assert.equal((await command(race)).repeated, true);
  assert.equal(race.tables.players.length, 1);
});
test("players: nombres y dorsales repetidos advierten sin inventar UNIQUE", async () => {
  const f = fixture([row(901, { full_name: "JUAN PÉRES", shirt_number: 7 })]);
  const saved = await command(f, { values: { ...values, shirtNumber: 7 } });
  assert.equal(saved.warnings.length, 2);
  assert.equal(f.tables.players.length, 2);
  assert.equal(
    duplicateWarnings(values, [saved.player], saved.player.id).length,
    0,
  );
});
test("players: edición antigua o carrera no sobrescribe otro guardado", async () => {
  const f = fixture([row()]);
  await assert.rejects(
    command(f, {
      mode: "edit",
      version: "2025-01-01T00:00:00Z",
      values: { ...values, fullName: "Nuevo" },
    }),
    /cambió/,
  );
  assert.equal(
    f.requests.some((r) => r.method === "PATCH"),
    false,
  );
  f.race = true;
  await assert.rejects(
    command(f, {
      mode: "edit",
      version: row().updated_at,
      values: { ...values, fullName: "Nuevo" },
    }),
    /Otro guardado/,
  );
  assert.equal(f.tables.players[0].full_name, values.fullName);
});
test("players: reintento idéntico de edición ya confirmada es seguro", async () => {
  const f = fixture([row()]);
  const v = { ...values, fullName: "Juan Pérez" };
  await command(f, { mode: "edit", version: row().updated_at, values: v });
  assert.equal(
    (await command(f, { mode: "edit", version: row().updated_at, values: v }))
      .repeated,
    true,
  );
  assert.equal(f.requests.filter((r) => r.method === "PATCH").length, 1);
});
test("players: false, NULL, error de Auth y falta de sesión impiden escribir", async () => {
  for (const permission of [false, null, "true"]) {
    const f = fixture();
    f.permission = permission;
    await assert.rejects(command(f), /No se autorizó/);
    assert.equal(
      f.requests.some((r) => r.method !== "GET"),
      false,
    );
  }
  const f = fixture();
  f.client.auth.getUser = async () =>
    ({ data: { user: null }, error: null }) as unknown as Awaited<
      ReturnType<typeof f.client.auth.getUser>
    >;
  await assert.rejects(command(f), /No se autorizó/);
  assert.equal(
    f.requests.some((r) => r.url.pathname.includes("is_mundialito_admin")),
    false,
  );
  f.client.auth.getUser = async () => {
    throw new Error("expired");
  };
  await assert.rejects(command(f), /No se autorizó/);
});
test("players: RLS y conflictos devuelven errores seguros sin éxito ficticio", async () => {
  for (const code of ["42501", "23505", "23503", "23514", "XX000"]) {
    const f = fixture();
    f.writeError = code;
    await assert.rejects(
      command(f),
      (e) => e instanceof Error && !e.message.includes("sensitive"),
    );
    assert.equal(f.tables.players.length, 0);
  }
});
test("players: no se edita jugador de otro equipo ni se acepta equipo inventado", async () => {
  const f = fixture([row(900, { team_id: uuid(101) })]);
  await assert.rejects(
    command(f, { mode: "edit", version: row().updated_at }),
    /no pertenece/,
  );
  await assert.rejects(command(f, { teamSlug: "inventado" }), /equipo oficial/);
  await assert.rejects(
    command(f, { values: { ...values, shirtNumber: 0 } }),
    /dorsal/,
  );
  assert.equal(
    f.requests.some((r) => r.method !== "GET"),
    false,
  );
});
test("players: lectura paginada completa, NULL e identidades desconocidas", async () => {
  const f = fixture(Array.from({ length: 105 }, (_, i) => row(900 + i)));
  const c = await readRosterContext(f.client);
  assert.equal((await readPlayers(f.client, c, uuid(100))).length, 105);
  assert.equal((await readPlayer(f.client, c, uuid(900)))!.shirtNumber, null);
  assert.throws(
    () => decodePlayer(row(900, { team_id: uuid(9999) }), c),
    /relación inválida/,
  );
  assert.throws(
    () => decodePlayer(row(900, { tournament_id: uuid(9999) }), c),
    /relación inválida/,
  );
  f.partial = true;
  await assert.rejects(readPlayers(f.client, c), /parciales/);
});
test("players: enlaces UUID sobreviven corrección e inactivación; legacy ambiguo no elige equipo", async () => {
  const f = fixture([
    row(900, { slug: "juan-peres", full_name: "Juan Pérez", is_active: false }),
    row(901, { slug: "comun" }),
    row(902, { slug: "comun", team_id: uuid(101) }),
  ]);
  const c = await readRosterContext(f.client);
  const p = await readPublicPlayerRecord(f.client, c, "juan-peres");
  assert.equal(p!.id, uuid(900));
  assert.equal(p!.active, false);
  assert.equal(
    (await readPublicPlayerRecord(f.client, c, publicPlayerSlug(p!)))!.id,
    p!.id,
  );
  assert.equal(await readPublicPlayerRecord(f.client, c, "comun"), null);
  assert.equal(
    await readPublicPlayerRecord(f.client, c, `missing--${uuid(9999)}`),
    null,
  );
});
test("players: transporte permite INSERT individual y PATCH delimitado, rechaza DELETE/upsert/identidad", async () => {
  let calls = 0;
  const guarded = adminFetch(host, async () => {
    calls++;
    return new Response("null");
  });
  const post = {
    id: uuid(900),
    team_id: uuid(100),
    tournament_id: uuid(1),
    slug: "juan",
  };
  await guarded(`${host}/rest/v1/players`, {
    method: "POST",
    body: JSON.stringify(post),
  });
  const scope = `?id=eq.${uuid(900)}&team_id=eq.${uuid(100)}&tournament_id=eq.${uuid(1)}&updated_at=eq.2026-01-01`;
  await guarded(`${host}/rest/v1/players${scope}`, {
    method: "PATCH",
    body: JSON.stringify({ full_name: "Juan Pérez" }),
  });
  const attempts = [
    { path: "/players", method: "DELETE", body: post },
    { path: "/players", method: "POST", body: [post] },
    { path: "/players?on_conflict=id", method: "POST", body: post },
    { path: "/teams", method: "POST", body: post },
    { path: "/players", method: "PATCH", body: { full_name: "Juan" } },
    { path: `/players${scope}`, method: "PATCH", body: { team_id: uuid(101) } },
    {
      path: `/players${scope.replace("id=eq.", "id=")}`,
      method: "PATCH",
      body: { full_name: "Juan" },
    },
  ];
  for (const a of attempts)
    await assert.rejects(
      guarded(`${host}/rest/v1${a.path}`, {
        method: a.method,
        body: JSON.stringify(a.body),
      }),
      /no permitida/,
    );
  assert.equal(calls, 2);
});
