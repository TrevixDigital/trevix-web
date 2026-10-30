import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as model from "../../src/lib/mundialito/matches/model.ts";
import * as player from "../../src/lib/mundialito/players/model.ts";
import { saveAdminMatch } from "../../src/lib/mundialito/matches/repository.ts";
import { uuid } from "./supabase-fixtures.ts";
type Action =
  typeof import("../../src/app/(torneo)/mundialito/admin/partidos/actions.ts").saveMatchAction;
function harness(save = saveAdminMatch) {
  let dataCalls = 0;
  const paths: { path: string; type?: string }[] = [];
  const client = {
    auth: {
      async getUser() {
        return { data: { user: null }, error: null };
      },
    },
    from() {
      dataCalls++;
      throw Error("unreachable");
    },
  } as unknown as SupabaseClient;
  const code = ts.transpileModule(
    readFileSync(
      new URL("../../src/app/(torneo)/mundialito/admin/partidos/actions.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const exports: { saveMatchAction?: Action } = {};
  const nodeRequire = createRequire(import.meta.url);
  runInNewContext(code, {
    exports,
    require: (id: string) => {
      if (id === "next/cache")
        return {
          revalidatePath: (path: string, type?: string) =>
            paths.push({ path, type }),
        };
      if (id === "@/lib/mundialito/admin/server")
        return { serverAdminClient: async () => client };
      if (id === "@/lib/mundialito/players/model") return player;
      if (id === "@/lib/mundialito/matches/model") return model;
      if (id === "@/lib/mundialito/matches/sync")
        return {
          syncConfirmedParticipants: async () => ({
            assigned: [],
            warnings: [],
            pending: 0,
          }),
        };
      if (id === "@/lib/mundialito/matches/repository") return { saveAdminMatch: save };
      return nodeRequire(id);
    },
  });
  return {
    action: exports.saveMatchAction!,
    paths,
    get dataCalls() {
      return dataCalls;
    },
  };
}
function form() {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    date: "",
    time: "",
    venue: "",
    notes: "",
    status: "finished",
    home_score: "2",
    away_score: "1",
    home_penalties: "",
    away_penalties: "",
    confirm: "on",
  }))
    f.set(k, v);
  return f;
}
test("acción de partido directa sin sesión no escribe ni revalida", async () => {
  const h = harness();
  const r = await h.action(
    { id: uuid(401), version: "2026-01-01T00:00:00Z" },
    { error: "" },
    form(),
  );
  assert.ok(r.error);
  assert.equal(r.success, undefined);
  assert.equal(h.dataCalls, 0);
  assert.equal(h.paths.length, 0);
});
test("acción de partido revalida tablas, estadísticas, llaves y perfiles tras confirmación", async () => {
  let input: Parameters<typeof saveAdminMatch>[1] | undefined;
  const h = harness(async (_client, i) => {
    input = i;
    assert.equal(h.paths.length, 0);
    return {
      id: i.id,
      localId: "O1",
      number: 19,
      values: model.validateMatchValues(i.values, "round_of_16"),
      version: "2026-01-02T00:00:00Z",
      auditVerified: true,
      warning: "",
      repeated: false,
    };
  });
  const f = form();
  for (const field of [
    "home_team_id",
    "phase",
    "tournament_id",
    "group_id",
    "home_source",
  ])
    f.set(field, "tampered");
  const r = await h.action(
    { id: uuid(419), version: "2026-01-01T00:00:00Z" },
    { error: "" },
    f,
  );
  assert.equal(r.error, "");
  assert.equal(r.success!.auditVerified, true);
  assert.equal(input!.confirmed, true);
  assert.ok(!Object.hasOwn(input!.values, "home_team_id"));
  for (const path of [
    "/mundialito",
    "/mundialito/grupos",
    "/mundialito/eliminatorias",
    "/mundialito/fase-final",
    "/mundialito/estadisticas",
    "/mundialito/partidos/O1",
    "/mundialito/admin/partidos",
  ])
    assert.ok(h.paths.some((p) => p.path === path));
  assert.ok(
    h.paths.some((p) => p.path === "/mundialito/equipos/[slug]" && p.type === "page"),
  );
});
test("acción de partido no publica éxito ni filtra errores internos si falla el guardado", async () => {
  const h = harness(async () => {
    throw Error("private-trigger-secret");
  });
  const r = await h.action(
    { id: uuid(401), version: "2026-01-01T00:00:00Z" },
    { error: "" },
    form(),
  );
  assert.equal(r.success, undefined);
  assert.ok(!r.error.includes("secret"));
  assert.equal(h.paths.length, 0);
});
