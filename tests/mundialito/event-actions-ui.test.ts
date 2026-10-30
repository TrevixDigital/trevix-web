import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as model from "../../src/lib/mundialito/events/model.ts";
import * as player from "../../src/lib/mundialito/players/model.ts";
import { saveEvent } from "../../src/lib/mundialito/events/repository.ts";
import { uuid } from "./supabase-fixtures.ts";
const nodeRequire = createRequire(import.meta.url);
type Action =
  typeof import("../../src/app/(torneo)/mundialito/admin/partidos/event-actions.ts").eventAction;
function load(path: string, dependencies: Record<string, unknown>) {
  const code = ts.transpileModule(
    readFileSync(
      new URL(`../../src/app/(torneo)/mundialito/admin/partidos/${path}`, import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2020,
      },
    },
  ).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(code, {
    exports,
    require: (id: string) =>
      Object.hasOwn(dependencies, id) ? dependencies[id] : nodeRequire(id),
  });
  return exports;
}
const binding = { id: uuid(1000), matchId: uuid(401), mode: "create" as const };
function form() {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    team_id: uuid(100),
    player_id: uuid(900),
    event_type: "goal",
    minute: "",
    notes: "",
    confirm: "on",
    tournament_id: "forged",
    match_id: "forged",
    id: "forged",
  }))
    f.set(k, v);
  return f;
}
function harness(save = saveEvent) {
  let calls = 0;
  const paths: string[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    from() {
      calls++;
      throw Error("not allowed");
    },
  } as unknown as SupabaseClient;
  const exported = load("event-actions.ts", {
    "@/lib/mundialito/admin/server": { serverAdminClient: async () => client },
    "@/lib/mundialito/events/repository": { saveEvent: save },
    "@/lib/mundialito/players/model": player,
    "@/lib/mundialito/matches/sync": {
      syncConfirmedParticipants: async () => ({
        assigned: [],
        warnings: [],
        pending: 0,
      }),
    },
    "next/cache": { revalidatePath: (p: string) => paths.push(p) },
  });
  return {
    action: exported.eventAction as Action,
    paths,
    get calls() {
      return calls;
    },
  };
}
test("acción de evento directa sin sesión no escribe ni revalida", async () => {
  const h = harness(),
    r = await h.action(binding, { error: "" }, form());
  assert.ok(r.error);
  assert.equal(r.success, undefined);
  assert.equal(h.calls, 0);
  assert.equal(h.paths.length, 0);
});
test("acción de evento conserva ámbito vinculado y revalida estadísticas, perfiles y reglamento", async () => {
  let input: Parameters<typeof saveEvent>[1] | undefined;
  const h = harness(async (_client, i) => {
    input = i;
    return {
      id: i.id,
      matchId: i.matchId,
      localId: i.matchId,
      repeated: false,
      warnings: [],
    };
  });
  const r = await h.action(binding, { error: "" }, form());
  assert.equal(r.error, "");
  assert.ok(player.isUuid(r.success!.nextId));
  assert.equal(input!.matchId, binding.matchId);
  assert.equal(input!.id, binding.id);
  assert.ok(!Object.hasOwn(input!.values!, "tournament_id"));
  for (const p of [
    "/mundialito/estadisticas",
    "/mundialito/grupos",
    "/mundialito/admin/reglamento",
    "/mundialito/equipos/[slug]",
    "/mundialito/jugadores/[slug]",
    "/mundialito/partidos/[id]",
  ])
    assert.ok(h.paths.includes(p));
});
test("panel de eventos identifica autogol anónimo y no confunde ausencia con acta completa", () => {
  const exported = load("event-panel.tsx", {
    "next/navigation":{useRouter:()=>({refresh(){}})},
    "@/lib/mundialito/events/model": model,
    "./event-actions": { eventAction: async () => ({ error: "" }) },
    "../admin.module.css": {
      __esModule: true,
      default: new Proxy({}, { get: (_t, k) => String(k) }),
    },
  });
  const EventPanel = exported.EventPanel as React.ComponentType<
    Record<string, unknown>
  >;
  const props = {
    matchId: uuid(401),
    newId: uuid(1001),
    players: [],
    teams: [
      { id: uuid(100), name: "La Bomba" },
      { id: uuid(101), name: "Villa Hermosa" },
    ],
    warnings: ["Marcador y goles no coinciden"],
  };
  const empty = renderToStaticMarkup(
    React.createElement(EventPanel, { ...props, events: [] }),
  );
  assert.match(empty, /Esto no certifica/);
  assert.match(empty, /Registrar evento/);
  assert.match(empty, /role="alert"/);
  const withEvent = renderToStaticMarkup(
    React.createElement(EventPanel, {
      ...props,
      events: [
        {
          id: uuid(1000),
          match_id: uuid(401),
          tournament_id: uuid(1),
          team_id: uuid(100),
          player_id: null,
          event_type: "own_goal",
          minute: null,
          notes: null,
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
        },
      ],
    }),
  );
  assert.match(withEvent, /Autor de autogol no identificado/);
  assert.match(withEvent, /Editar/);
  assert.match(withEvent, /Eliminar incorrecto/);
});
