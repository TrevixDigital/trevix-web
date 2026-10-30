import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as model from "../../src/lib/mundialito/players/model.ts";
import { saveRosterPlayer } from "../../src/lib/mundialito/players/repository.ts";
import { uuid } from "./supabase-fixtures.ts";

type Action =
  typeof import("../../src/app/(torneo)/mundialito/admin/jugadores/actions.ts").savePlayerAction;
const binding = {
  teamSlug: "la-bomba",
  id: uuid(900),
  mode: "create" as const,
};
function form() {
  const f = new FormData();
  f.set("full_name", "Persona Ñandú");
  f.set("shirt_number", "");
  f.set("position", "");
  f.set("is_active", "on");
  return f;
}
function actionHarness({
  user = true,
  permission = true,
  rpcError = null,
  save = saveRosterPlayer,
}: {
  user?: boolean;
  permission?: unknown;
  rpcError?: unknown;
  save?: typeof saveRosterPlayer;
} = {}) {
  let databaseCalls = 0,
    rpcCalls = 0;
  const invalidations: string[] = [];
  const client = {
    auth: {
      async getUser() {
        return { data: { user: user ? { id: uuid(800) } : null }, error: null };
      },
    },
    async rpc() {
      rpcCalls++;
      return { data: permission, error: rpcError };
    },
    from() {
      databaseCalls++;
      throw new Error("No database access expected in this fixture");
    },
  } as unknown as SupabaseClient;
  const code = ts.transpileModule(
    readFileSync(
      new URL("../../src/app/(torneo)/mundialito/admin/jugadores/actions.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const exports: { savePlayerAction?: Action } = {};
  const nodeRequire = createRequire(import.meta.url);
  runInNewContext(code, {
    exports,
    require: (id: string) => {
      if (id === "next/cache")
        return { revalidatePath: (path: string) => invalidations.push(path) };
      if (id === "@/lib/mundialito/admin/server")
        return {
          serverAdminClient: async (writable: boolean) => {
            assert.equal(writable, true);
            return client;
          },
        };
      if (id === "@/lib/mundialito/players/model") return model;
      if (id === "@/lib/mundialito/players/repository") return { saveRosterPlayer: save };
      return nodeRequire(id);
    },
  });
  return {
    action: exports.savePlayerAction!,
    invalidations,
    get databaseCalls() {
      return databaseCalls;
    },
    get rpcCalls() {
      return rpcCalls;
    },
  };
}
test("acción directa: sin sesión rechaza aunque el navegador envíe un éxito anterior falsificado", async () => {
  const h = actionHarness({ user: false });
  const r = await h.action(
    binding,
    {
      error: "",
      success: {
        id: uuid(900),
        name: "Falsificado",
        warnings: [],
        repeated: false,
        nextRegistrationId: uuid(901),
      },
    },
    form(),
  );
  assert.match(r.error, /No se autorizó/);
  assert.equal(r.success, undefined);
  assert.equal(h.databaseCalls, 0);
  assert.equal(h.rpcCalls, 0);
  assert.deepEqual(h.invalidations, []);
});
test("acción directa: usuario sin membresía, RPC NULL/cadena/error no acceden a la base de jugadores", async () => {
  for (const permission of [false, null, "true"]) {
    const h = actionHarness({ permission }),
      r = await h.action(binding, { error: "" }, form());
    assert.match(r.error, /No se autorizó/);
    assert.equal(r.success, undefined);
    assert.equal(h.databaseCalls, 0);
    assert.equal(h.rpcCalls, 1);
    assert.deepEqual(h.invalidations, []);
  }
  const h = actionHarness({ rpcError: new Error("RLS unavailable") });
  assert.match(
    (await h.action(binding, { error: "" }, form())).error,
    /No se autorizó/,
  );
  assert.equal(h.databaseCalls, 0);
});
test("acción: ignora identidad en FormData y revalida perfiles solo después de confirmar el guardado", async () => {
  let received: Parameters<typeof saveRosterPlayer>[1] | undefined;
  const player: model.RosterPlayer = {
    id: binding.id,
    tournamentId: uuid(1),
    teamId: uuid(100),
    fullName: "Persona Ñandú",
    slug: model.makePlayerSlug("Persona Ñandú", binding.id),
    shirtNumber: null,
    position: null,
    active: true,
    updatedAt: "2026-01-01T00:00:00Z",
  };
  const h = actionHarness({
    save: async (_client, input) => {
      assert.equal(h.invalidations.length, 0);
      received = input;
      return {
        player,
        team: { id: uuid(100), name: "La Bomba", slug: "la-bomba", group: "A" },
        warnings: [],
        repeated: false,
      };
    },
  });
  const f = form();
  for (const name of ["id", "team_id", "tournament_id", "slug"])
    f.set(name, "manipulado");
  const r = await h.action(binding, { error: "" }, f);
  assert.equal(r.error, "");
  assert.equal(r.success!.id, binding.id);
  assert.ok(model.isUuid(r.success!.nextRegistrationId));
  assert.equal(received!.id, binding.id);
  assert.equal(received!.teamSlug, "la-bomba");
  assert.deepEqual(Object.keys(received!.values).sort(), [
    "active",
    "fullName",
    "position",
    "shirtNumber",
  ]);
  assert.equal(received!.values.shirtNumber, null);
  assert.equal(received!.values.position, null);
  assert.deepEqual(h.invalidations, [
    "/mundialito/admin/jugadores/la-bomba",
    `/mundialito/admin/jugadores/la-bomba/${binding.id}/editar`,
    "/mundialito/admin/jugadores",
    "/mundialito/equipos/la-bomba",
    `/mundialito/jugadores/${player.slug}`,
  ]);
});
test("acción: un fallo de guardado no muestra éxito, no invalida y no filtra el mensaje interno", async () => {
  const h = actionHarness({
    save: async () => {
      throw new Error("secret-access-token-sentinel");
    },
  });
  const r = await h.action(binding, { error: "" }, form());
  assert.equal(r.success, undefined);
  assert.ok(r.error.length > 0);
  assert.ok(!r.error.includes("sentinel"));
  assert.deepEqual(h.invalidations, []);
});
test("acción: validación inválida impide ejecutar el repositorio", async () => {
  let calls = 0;
  const h = actionHarness({
    save: async () => {
      calls++;
      throw new Error("unreachable");
    },
  });
  const f = form();
  f.set("shirt_number", "100");
  assert.match((await h.action(binding, { error: "" }, f)).error, /dorsal/);
  assert.equal(calls, 0);
});
