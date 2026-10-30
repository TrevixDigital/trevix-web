import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { calendarRows, uuid } from "./supabase-fixtures.ts";
import { adminFetch } from "../../src/lib/mundialito/admin/transport.ts";
import {
  OFFICIAL_FILES,
  officialPlan,
  createOfficialRun,
  executeOfficialBatch,
  classifyTarget,
} from "../../src/lib/mundialito/players/official-import.ts";
import type { RosterFile } from "../../src/lib/mundialito/players/import-preview.ts";
import { readPlayers } from "../../src/lib/mundialito/players/repository.ts";

function files(): RosterFile[] {
  return OFFICIAL_FILES.map((p) => ({
    name: p.file,
    sha256: p.hash,
    encoding: "UTF-8",
    text:
      p.file.replace(/\.txt$/, "") +
      "\r\n" +
      Array.from(
        { length: p.count },
        (_, i) =>
          `${i + 1}. ${p.slug === "la-bomba" && i === 0 ? "Persona Ñandú" : p.slug === "villa-hermosa" && i === 4 ? "Persona Sintética Ajustada " : `Jugador Apellido ${String.fromCharCode(65 + i)}`}`,
      ).join("\r\n") +
      (p.slug === "san-julian" ? "\r\n24.\r\n25." : "") +
      "\r\n",
  }));
}
type Row = Record<string, unknown>;
function fixture() {
  const calendar = calendarRows();
  const team = calendar.teams.find((t) => t.slug === "la-bomba")!;
  const original: Row = {
    id: uuid(9900),
    team_id: team.id,
    tournament_id: uuid(1),
    full_name: "Persona Ñandú",
    slug: "jorge-original",
    shirt_number: 9,
    position: "forward",
    is_active: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  };
  const tables: Record<string, Row[]> = {
    ...calendar,
    players: [structuredClone(original)],
  };
  let permission: unknown = true,
    user = true,
    fail = false,
    uncertain = false;
  const writes: Row[] = [];
  const client = createClient(
    "https://official.example.test",
    "sb_publishable_test",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: adminFetch(
          "https://official.example.test",
          async (input, init) => {
            const url = new URL(String(input)),
              method = init?.method ?? "GET";
            const json = (
              data: unknown,
              status = 200,
              headers: Record<string, string> = {},
            ) =>
              new Response(JSON.stringify(data), {
                status,
                headers: { "Content-Type": "application/json", ...headers },
              });
            if (url.pathname.endsWith("is_mundialito_admin"))
              return json(permission);
            const table = url.pathname.split("/").at(-1)!;
            assert.ok(tables[table]);
            if (method === "GET") {
              const found = tables[table].filter((r) =>
                [...url.searchParams].every(
                  ([key, v]) =>
                    !v.startsWith("eq.") || String(r[key]) === v.slice(3),
                ),
              );
              const data = found.slice(
                Number(url.searchParams.get("offset") ?? 0),
                Number(url.searchParams.get("offset") ?? 0) +
                  Number(url.searchParams.get("limit") ?? 10000),
              );
              return json(data, 200, {
                "Content-Range": `0-${Math.max(0, data.length - 1)}/${found.length}`,
              });
            }
            assert.equal(
              method,
              "POST",
              "No UPDATE, DELETE or upsert permitted",
            );
            assert.equal(table, "players");
            const body = JSON.parse(String(init?.body));
            writes.push(body);
            if (fail)
              return json(
                { code: "42501", message: "private backend detail" },
                403,
              );
            if (
              tables.players.some(
                (r) =>
                  r.id === body.id ||
                  (r.team_id === body.team_id && r.slug === body.slug),
              )
            )
              return json({ code: "23505" }, 409);
            const created = {
              ...body,
              created_at: "2026-01-03T00:00:00Z",
              updated_at: "2026-01-03T00:00:00Z",
            };
            tables.players.push(created);
            if (uncertain)
              return json({ code: "XX000", message: "lost confirmation" }, 500);
            return json(created, 201);
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
    original,
    set permission(v: unknown) {
      permission = v;
    },
    set user(v: boolean) {
      user = v;
    },
    set fail(v: boolean) {
      fail = v;
    },
    set uncertain(v: boolean) {
      uncertain = v;
    },
  };
}
async function start(f: ReturnType<typeof fixture>) {
  const plan = await officialPlan(f.client, files());
  return createOfficialRun(f.client, files(), plan.planHash);
}
const persist = async () => {};
test("oficial: 85 nombres, solo cuatro equipos, ajuste exacto de espacio y vacíos excluidos", async () => {
  const f = fixture(),
    p = await officialPlan(f.client, files());
  assert.equal(p.targets.length, 85);
  assert.equal(p.entries.filter((e) => e.status === "create").length, 84);
  assert.equal(p.entries.filter((e) => e.status === "existing").length, 1);
  assert.equal(
    p.targets.find((t) => t.name.startsWith("Persona Sintética Ajustada"))!.name,
    "Persona Sintética Ajustada",
  );
  assert.ok(
    !p.targets.some(
      (t) => t.name === "24." || t.name === "25." || t.teamSlug === "san-diego",
    ),
  );
  const changed = files();
  changed[0].sha256 = "changed";
  await assert.rejects(officialPlan(f.client, changed), /cambió/);
  await assert.rejects(
    officialPlan(f.client, [
      ...files(),
      { ...files()[0], name: "Nomina_San_Diego.txt" },
    ]),
    /exactamente cuatro/,
  );
});
test("oficial: importación completa conserva Jorge exactamente y todos los nuevos usan NULL/activo", async () => {
  const f = fixture(),
    run = await start(f);
  let snapshots = 0;
  while (!run.complete && !run.error)
    await executeOfficialBatch(f.client, files(), run, async () => {
      snapshots++;
    });
  assert.equal(run.error, "");
  assert.equal(run.complete, true);
  assert.equal(f.writes.length, 84);
  assert.equal(f.tables.players.length, 85);
  assert.deepEqual(
    f.tables.players.find((p) => p.id === f.original.id),
    f.original,
  );
  for (const p of f.writes) {
    assert.equal(p.shirt_number, null);
    assert.equal(p.position, null);
    assert.equal(p.is_active, true);
  }
  assert.ok(snapshots > 85);
  assert.equal(run.verification!.preserved, true);
  assert.equal(run.verification!.newDefaultsValid, true);
  assert.deepEqual(
    run.verification!.teams.map((t) => t.total),
    [17, 21, 23, 24],
  );
  assert.ok(
    run.verification!.teams.every((t) => t.duplicates === 0 && t.pending === 0),
  );
  const repeat = await start(f);
  while (!repeat.complete && !repeat.error)
    await executeOfficialBatch(f.client, files(), repeat, persist);
  assert.equal(f.writes.length, 84);
  assert.equal(
    repeat.outcomes.filter((o) => o.status === "existing").length,
    85,
  );
});
test("oficial: reintento tras confirmación perdida recupera el UUID sin otra alta", async () => {
  const f = fixture(),
    run = await start(f);
  f.uncertain = true;
  await executeOfficialBatch(f.client, files(), run, persist);
  assert.ok(run.error);
  assert.equal(f.tables.players.length, 2);
  assert.equal(f.writes.length, 1);
  f.uncertain = false;
  await executeOfficialBatch(f.client, files(), run, persist);
  assert.equal(run.error, "");
  assert.equal(run.outcomes.filter((o) => o.status === "inserted").length, 5);
  assert.equal(f.tables.players.length, 6);
  assert.equal(f.writes.length, 5);
  assert.equal(new Set(f.tables.players.map((p) => p.id)).size, 6);
});
test("oficial: RLS detiene sin continuar ciegamente y el plan inicial debe seguir vigente", async () => {
  const f = fixture(),
    run = await start(f);
  f.fail = true;
  await executeOfficialBatch(f.client, files(), run, persist);
  assert.match(run.error, /RLS/);
  assert.ok(!run.error.includes("private"));
  assert.equal(f.writes.length, 1);
  assert.equal(f.tables.players.length, 1);
  await assert.rejects(
    createOfficialRun(f.client, files(), "stale"),
    /cambiaron/,
  );
});
test("oficial: sin sesión, sin permisos y ejecución de otro usuario nunca escriben", async () => {
  const f = fixture();
  f.user = false;
  await assert.rejects(start(f), /iniciar sesión/);
  f.user = true;
  for (const p of [false, null, "true"]) {
    f.permission = p;
    await assert.rejects(start(f), /No se autorizó/);
  }
  f.permission = true;
  const run = await start(f);
  run.owner = uuid(999);
  await assert.rejects(
    executeOfficialBatch(f.client, files(), run, persist),
    /otra sesión/,
  );
  assert.equal(f.writes.length, 0);
});
test("oficial: nombre con caso/espacios conserva existente, tildes diferentes no fusionan personas", async () => {
  const f = fixture(),
    p = await officialPlan(f.client, files()),
    t = p.targets[0],
    existing = await readPlayers(f.client, p.context);
  assert.equal(
    classifyTarget(t, [{ ...existing[0], fullName: "  PERSONA   ÑANDÚ " }])
      .status,
    "existing",
  );
  assert.equal(
    classifyTarget(t, [{ ...existing[0], fullName: "Persona Nandu" }]).status,
    "review",
  );
  assert.equal(
    classifyTarget(t, [existing[0], { ...existing[0], id: uuid(999) }]).status,
    "review",
  );
});
test("oficial: cambios en fichas previas o fuentes detienen antes de insertar", async () => {
  const f = fixture(),
    run = await start(f);
  f.tables.players[0].shirt_number = 10;
  await executeOfficialBatch(f.client, files(), run, persist);
  assert.match(run.error, /preexistente cambió/);
  assert.equal(f.writes.length, 0);
  const changed = files();
  changed[3].sha256 = "changed";
  await assert.rejects(
    executeOfficialBatch(f.client, changed, run, persist),
    /cambió/,
  );
  assert.equal(f.writes.length, 0);
});
test("oficial: no se inserta si el registro durable del intento falla", async () => {
  const f = fixture(),
    run = await start(f);
  run.cursor = 1; // Next target is new; first operation must journal the attempt.
  await assert.rejects(
    executeOfficialBatch(f.client, files(), run, async () => {
      throw new Error("disk full");
    }),
  );
  assert.equal(f.writes.length, 0);
});
