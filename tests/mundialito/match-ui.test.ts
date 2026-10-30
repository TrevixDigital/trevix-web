import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as model from "../../src/lib/mundialito/matches/model.ts";
import * as players from "../../src/lib/mundialito/players/model.ts";
import { uuid } from "./supabase-fixtures.ts";
function component(path: string) {
  const code = ts.transpileModule(
    readFileSync(
      new URL(`../../src/app/(torneo)/mundialito/admin/partidos/${path}.tsx`, import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const exports: Record<
    string,
    React.ComponentType<Record<string, unknown>>
  > = {};
  const nodeRequire = createRequire(import.meta.url);
  runInNewContext(code, {
    exports,
    require: (id: string) => {
      if (id.endsWith(".module.css"))
        return {
          __esModule: true,
          default: new Proxy({}, { get: (_t, k) => String(k) }),
        };
      if (id === "next/link")
        return {
          __esModule: true,
          default: ({ children, ...props }: React.ComponentProps<"a">) =>
            React.createElement("a", props, children),
        };
      if (id === "@/lib/mundialito/matches/model") return model;
      if (id === "@/lib/mundialito/players/model") return players;
      if (id === "./actions")
        return { saveMatchAction: async () => ({ error: "" }) };
      return nodeRequire(id);
    },
  });
  return exports;
}
test("partidos UI: fase/jornada/estado/búsqueda y lista inicial acotada con VS", () => {
  const { MatchBrowser } = component("match-browser");
  const base = {
    id: uuid(401),
    number: 1,
    phase: "groups",
    dayId: "j1",
    dayNumber: 1,
    group: "A",
    home: "La Bomba",
    away: "Villa Hermosa",
    status: "scheduled",
    at: null,
    venue: null,
    homeScore: 0,
    awayScore: 0,
    penalties: null,
  };
  const html = renderToStaticMarkup(
    React.createElement(MatchBrowser, {
      matches: [
        base,
        { ...base, id: uuid(402), number: 2, dayId: "j2", dayNumber: 2 },
        { ...base, id: uuid(419), number: 19, phase: "round_of_16" },
      ],
    }),
  );
  for (const label of ["Fase", "Jornada", "Estado", "Buscar equipo"])
    assert.ok(html.includes(label));
  assert.match(html, /Jornada 1/);
  assert.match(html, /Jornada 2/);
  assert.match(html, /VS/);
  assert.ok(html.includes(`/mundialito/admin/partidos/${uuid(401)}/editar`));
  assert.ok(!html.includes(`/mundialito/admin/partidos/${uuid(402)}/editar`));
  assert.ok(!html.includes(`/mundialito/admin/partidos/${uuid(419)}/editar`));
});
test("partidos UI: formulario sin ceros automáticos ni identidades editables y con confirmación", () => {
  const { MatchForm } = component("match-form");
  const values = {
    scheduled_at: null,
    venue: null,
    notes: null,
    status: "scheduled",
    home_score: null,
    away_score: null,
    home_penalties: null,
    away_penalties: null,
  };
  const html = renderToStaticMarkup(
    React.createElement(MatchForm, {
      id: uuid(401),
      version: "2026-01-01",
      phase: "groups",
      values,
    }),
  );
  for (const key of [
    "id",
    "home_team_id",
    "away_team_id",
    "tournament_id",
    "group_id",
    "phase",
    "home_source",
  ])
    assert.ok(!html.includes(`name="${key}"`));
  assert.match(html, /type="checkbox"/);
  assert.match(html, /Confirmo los cambios/);
  assert.match(html, /Guardar partido/);
  assert.match(html, /Cancelar/);
  assert.match(html, /inputMode="numeric"/i);
  assert.ok(!html.includes('id="home_penalties"'));
  assert.ok(!html.includes('value="0"'));
  const knockout = renderToStaticMarkup(
    React.createElement(MatchForm, {
      id: uuid(419),
      version: "2026-01-01",
      phase: "round_of_16",
      values,
    }),
  );
  assert.ok(knockout.includes('id="home_penalties"'));
});
