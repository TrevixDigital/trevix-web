import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as model from "../../src/lib/mundialito/players/model.ts";
import { uuid } from "./supabase-fixtures.ts";

// Render the actual TSX components without a Next runtime or production auth bypass.
const nodeRequire = createRequire(import.meta.url);
function component(path: string, pathname = "/mundialito/admin/jugadores") {
  const code = ts.transpileModule(
    readFileSync(new URL(`../../src/${path.replace("app/", "app/(torneo)/mundialito/").replace("components/", "components/mundialito/")}`, import.meta.url), "utf8"),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const exports: Record<
    string,
    React.ComponentType<Record<string, unknown>>
  > = {};
  const localRequire = (id: string): unknown => {
    if (id.endsWith(".module.css"))
      return {
        __esModule: true,
        default: new Proxy({}, { get: (_t, key) => String(key) }),
      };
    if (id === "@/lib/mundialito/players/model") return model;
    if (id === "next/link")
      return {
        __esModule: true,
        default: ({ children, ...props }: React.ComponentProps<"a">) =>
          React.createElement("a", props, children),
      };
    if (id === "next/image")
      return {
        __esModule: true,
        default: (props: React.ComponentProps<"img">) =>
          React.createElement("img", props),
      };
    if (id === "next/navigation") return { usePathname: () => pathname };
    if (id === "@/lib/mundialito/site") return { assetPath: (path: string) => `/mundialito${path}` };
    if (id === "./actions")
      return { savePlayerAction: async () => ({ error: "" }) };
    return nodeRequire(id);
  };
  runInNewContext(code, { exports, require: localRequire });
  return exports;
}
const team = {
  id: uuid(100),
  name: "Equipo oficial",
  slug: "equipo-oficial",
  group: "A",
};
const player: model.RosterPlayer = {
  id: uuid(900),
  tournamentId: uuid(1),
  teamId: team.id,
  fullName: "Juan Pérez",
  slug: `juan-peres--${uuid(900)}`,
  shirtNumber: null,
  position: null,
  active: false,
  updatedAt: "2026-01-01T00:00:00Z",
};
test("admin UI: navegación propia resalta Jugadores en edición y desaparece en login", () => {
  const { AdminNavigation } = component(
    "app/admin/admin-navigation.tsx",
    `/mundialito/admin/jugadores/${team.slug}/${player.id}/editar`,
  );
  const html = renderToStaticMarkup(
    React.createElement(AdminNavigation, null, "Contenido"),
  );
  assert.match(html, /href="\/mundialito\/admin\/jugadores" aria-current="page"/);
  for (const route of [
    "/mundialito/admin",
    "/mundialito/admin/jugadores",
    "/mundialito/admin/partidos",
    "/mundialito/admin/estadisticas",
  ])
    assert.ok(html.includes(`href="${route}"`));
  assert.match(html, /aria-label="Cerrar sesión"/);
  assert.match(html, /action="\/mundialito\/admin\/logout" method="post"/);
  const login = component(
    "app/admin/admin-navigation.tsx",
    "/mundialito/admin/login",
  ).AdminNavigation;
  assert.ok(
    !renderToStaticMarkup(React.createElement(login, null, "Login")).includes(
      "Navegación administrativa",
    ),
  );
});
test("admin UI: nómina accesible muestra NULL como sin dorsal, inactivo y Editar por UUID", () => {
  const { RosterList } = component("app/admin/jugadores/roster-list.tsx");
  const html = renderToStaticMarkup(
    React.createElement(RosterList, { players: [player], teamSlug: team.slug }),
  );
  assert.match(html, /type="search"/);
  assert.match(html, /aria-label="Sin dorsal"/);
  assert.match(html, /Inactivo/);
  assert.ok(html.includes(`/mundialito/admin/jugadores/${team.slug}/${player.id}/editar`));
  assert.match(html, /Juan Pérez/);
  const empty = renderToStaticMarkup(
    React.createElement(RosterList, { players: [], teamSlug: team.slug }),
  );
  assert.match(empty, /todavía no tiene jugadores/);
});
test("admin UI: formulario real tiene etiquetas, posiciones inglesas y no permite editar identidad", () => {
  const { PlayerForm } = component("app/admin/jugadores/player-form.tsx");
  const html = renderToStaticMarkup(
    React.createElement(PlayerForm, {
      team,
      id: player.id,
      player,
      roster: [player],
    }),
  );
  for (const field of ["full_name", "shirt_number", "position", "is_active"])
    assert.ok(html.includes(`name="${field}"`));
  for (const field of ["id", "team_id", "tournament_id", "slug"])
    assert.ok(!html.includes(`name="${field}"`));
  for (const position of Object.keys(model.positions))
    assert.ok(html.includes(`value="${position}"`));
  assert.match(html, /Guardar jugador/);
  assert.match(html, /Cancelar/);
  assert.match(html, /min="1" max="99"/);
  assert.match(html, /value="Juan Pérez"/);
  assert.match(html, /for="player-name"/);
});

test("admin UI: nómina larga conserva todas las fichas y sus enlaces de edición", () => {
  const { RosterList } = component("app/admin/jugadores/roster-list.tsx");
  const players = Array.from({ length: 125 }, (_, i) => ({
    ...player,
    id: uuid(1000 + i),
    fullName: `Jugador de prueba ${i + 1}`,
  }));
  const html = renderToStaticMarkup(
    React.createElement(RosterList, { players, teamSlug: team.slug }),
  );
  assert.equal((html.match(/class="rosterCard"/g) ?? []).length, 125);
  assert.ok(
    html.includes(`/mundialito/admin/jugadores/${team.slug}/${uuid(1124)}/editar`),
  );
  assert.equal(
    model.normalizePlayerName("  JOSÉ   PÉREZ "),
    model.normalizePlayerName("José Pérez"),
  );
});
