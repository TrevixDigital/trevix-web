import fs from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type React from "react";
import { profileFixture } from "./team-profile-presentation-fixture.ts";
import { observedDisciplineSummary } from "../../src/lib/mundialito/engine/discipline.ts";
import * as playerModel from "../../src/lib/mundialito/players/model.ts";
import { statusLabels } from "../../src/lib/mundialito/matches/model.ts";
import { assetPath } from "../../src/lib/mundialito/site.ts";
import type { PlayerProfileProps, playerView, eventLabel } from "../../src/app/(torneo)/mundialito/jugadores/[slug]/player-view.ts";

export function playerFixture(): PlayerProfileProps {
  const p = profileFixture();
  return { player: p.roster[0], teamSlug: p.slug, snapshot: p.report.calculation, calendar: p.calendar };
}
export function loadPlayerViews() {
  const require = createRequire(import.meta.url);
  function compile(file: string, overrides: Record<string, unknown> = {}) {
    const exports: Record<string, unknown> = {};
    const code = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    runInNewContext(code, { exports, Intl, Date, Set, require: (id: string) => overrides[id] ?? require(id) });
    return exports;
  }
  const model = compile("../../src/app/(torneo)/mundialito/jugadores/[slug]/player-view.ts", { "@/lib/mundialito/engine/discipline": { observedDisciplineSummary } });
  const view = compile("../../src/app/(torneo)/mundialito/jugadores/[slug]/player-profile.tsx", { "next/link": { __esModule: true, default: "a" }, "@/lib/mundialito/site": { assetPath }, "@/lib/mundialito/players/model": playerModel, "@/lib/mundialito/matches/model": { statusLabels }, "./player-view": model, "./player.module.css": { __esModule: true, default: new Proxy({}, { get: (_t, k) => String(k) }) } });
  return { ...model, ...view } as { playerView: typeof playerView; eventLabel: typeof eventLabel; PlayerProfile: React.ComponentType<PlayerProfileProps> };
}
