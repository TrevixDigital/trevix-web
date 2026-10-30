import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import {
  cardOutcome,
  cardValues,
  cardDefaults,
  parseCardState,
  type CardState,
  type CardEvent,
} from "../../src/lib/mundialito/events/cards.ts";
import {
  loadPlayerCards,
  savePlayerCards,
} from "../../src/lib/mundialito/events/card-repository.ts";
import { readCardSnapshot } from "../../src/lib/mundialito/events/card-read.ts";
import { adminFetch } from "../../src/lib/mundialito/admin/transport.ts";
import { readonlyFetch } from "../../src/lib/mundialito/supabase/readonly-fetch.ts";
import { disciplineSummary } from "../../src/lib/mundialito/engine/discipline.ts";
import { suspensionWarnings } from "../../src/lib/mundialito/engine/regulatory.ts";
import { mapSupabaseCalendar } from "../../src/lib/mundialito/adapters/supabase-calendar.ts";
import { calendarRows, uuid } from "./supabase-fixtures.ts";
import { enrichWithEvents } from "../../src/lib/mundialito/events/read.ts";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as cardsModule from "../../src/lib/mundialito/events/cards.ts";
const scope = { matchId: uuid(401), teamId: uuid(100), playerId: uuid(900) };
const empty: CardState = { basis: "a".repeat(64), events: [] };
const card = (
  id: number,
  type: "yellow_card" | "red_card" = "yellow_card",
  cause: CardEvent["dismissal_cause"] = null,
): CardEvent => ({
  id: uuid(id),
  match_id: scope.matchId,
  team_id: scope.teamId,
  player_id: scope.playerId,
  tournament_id: uuid(1),
  event_type: type,
  minute: id === 1001 ? 20 : null,
  notes: "Conservar nota",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  dismissal_cause: cause,
});
const raw = {
  yellows: "2",
  direct_reds: "0",
  yellow_id_0: "",
  yellow_id_1: "",
  yellow_minute_0: "20",
  yellow_minute_1: "",
  red_minute: "",
};
test("cantidades: seis combinaciones, puntos separados de tarjetas y expulsiones", () => {
  for (const [y, r, p, c] of [
    [0, 0, 0, null],
    [1, 0, 1, null],
    [2, 0, 3, "second_yellow"],
    [0, 1, 4, "direct"],
    [1, 1, 5, "direct"],
  ] as const) {
    const result = cardOutcome(y, r);
    assert.equal(result.points, p);
    assert.equal(result.cause, c);
    assert.equal(result.expulsions, c ? 1 : 0);
  }
  for (const [y, r] of [
    [2, 1],
    [-1, 0],
    [3, 0],
    [1, 2],
    [0.5, 0],
    [NaN, 0],
  ])
    assert.throws(() => cardOutcome(y, r));
  assert.equal(cardOutcome(2, 0).suspensionMatches, 1);
  assert.equal(cardOutcome(0, 1).suspensionMatches, null);
});
test("cantidades: conserva IDs/minutos elegidos, NULL y no permite sustituir amarillas por nuevas", () => {
  const state = {
    ...empty,
    events: [card(1001), card(1002), card(1003, "red_card", "second_yellow")],
  };
  const v = cardValues(
    { ...raw, yellows: "1", yellow_id_0: uuid(1002), yellow_minute_0: "" },
    state,
  );
  assert.deepEqual(v.yellowCards, [{ id: uuid(1002), minute: null }]);
  assert.equal(v.redMinute, null);
  assert.throws(() => cardValues({ ...raw, yellows: "1" }, state), /Conserva/);
  assert.throws(
    () =>
      cardValues(
        { ...raw, yellow_id_0: uuid(1001), yellow_id_1: uuid(1001) },
        state,
      ),
    /misma/,
  );
  assert.throws(
    () => cardValues({ ...raw, yellow_minute_0: "131" }, empty),
    /minuto/,
  );
  assert.throws(
    () => cardValues({ ...raw, yellow_minute_0: "1.5" }, empty),
    /minuto/,
  );
  assert.throws(
    () => cardValues({ ...raw, direct_reds: "1" }, empty),
    /revisión/,
  );
});
test("cantidades: roja histórica no se interpreta como directa y un historial excepcional no se sobrescribe", () => {
  assert.equal(
    cardDefaults({ ...empty, events: [card(1003, "red_card")] }).directReds,
    "",
  );
  const exceptional = {
    ...empty,
    events: [card(1001), card(1002), card(1003, "red_card", "direct")],
  };
  assert.equal(cardDefaults(exceptional).reviewRequired, true);
  assert.throws(() => cardValues(raw, exceptional), /historial/);
  assert.throws(
    () => parseCardState({ ...empty, events: [card(1001), card(1001)] }),
    /repetidos/,
  );
});
function harness(
  permission: unknown = true,
  user = true,
  error: string | null = null,
) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const saved = {
    ...empty,
    events: [card(1001), card(1002), card(1003, "red_card", "second_yellow")],
  };
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: user ? { id: uuid(800) } : null },
        error: null,
      }),
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "is_mundialito_admin")
        return { data: permission, error: null };
      if (error) return { data: null, error: { code: error } };
      return {
        data:
          name === "mundialito_get_player_cards"
            ? empty
            : {
                state: saved,
                points: 3,
                dismissal_cause: "second_yellow",
                repeated: false,
                superseded: false,
              },
        error: null,
      };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}
test("cantidades: servidor deniega visitantes y RPC false/NULL antes de operaciones", async () => {
  for (const [permission, user] of [
    [true, false],
    [false, true],
    [null, true],
  ] as const) {
    const h = harness(permission, user);
    await assert.rejects(
      () => loadPlayerCards(h.client, scope),
      /administrativa/,
    );
    assert.ok(h.calls.every((c) => c.name === "is_mundialito_admin"));
  }
});
test("cantidades: guardado usa una RPC atómica con token y UUID estables; conflicto y migración ausente no hacen fallback", async (t) => {
  isolatedCards(t);
  const binding = { ...scope, state: empty, requestId: uuid(2000) },
    h = harness();
  const result = await savePlayerCards(h.client, binding, raw, true);
  assert.equal(result.outcome.points, 3);
  const call = h.calls.find((c) => c.name === "mundialito_save_player_cards")!;
  assert.equal(call.args.p_expected_basis, empty.basis);
  assert.equal(call.args.p_request_id, binding.requestId);
  assert.deepEqual(call.args.p_yellow_cards, [
    { id: null, minute: 20 },
    { id: null, minute: null },
  ]);
  await assert.rejects(
    () => savePlayerCards(h.client, binding, raw, false),
    /Confirma/,
  );
  for (const code of ["40001", "PGRST202", "42501"]) {
    const h = harness(true, true, code);
    await assert.rejects(() => savePlayerCards(h.client, binding, raw, true));
    assert.equal(
      h.calls.filter((c) => c.name !== "is_mundialito_admin").length,
      1,
    );
  }
});
test("cantidades: transporte solo admite RPC concretas, ámbito válido y cantidades coherentes", async (t) => {
  isolatedCards(t);
  const origin = "https://cards.example.test";
  let calls = 0;
  const transport = adminFetch(origin, async () => {
    calls++;
    return Response.json({});
  });
  const body = {
    p_request_id: uuid(2000),
    p_match_id: scope.matchId,
    p_team_id: scope.teamId,
    p_player_id: scope.playerId,
    p_expected_basis: empty.basis,
    p_yellows: 2,
    p_direct_reds: 0,
    p_yellow_cards: [
      { id: null, minute: null },
      { id: null, minute: null },
    ],
    p_red_minute: null,
    p_confirmed: true,
    p_clear_red_minute: false,
  };
  await transport(`${origin}/rest/v1/rpc/mundialito_save_player_cards`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  assert.equal(calls, 1);
  for (const changed of [
    { ...body, p_direct_reds: 1 },
    { ...body, p_confirmed: false },
    { ...body, service_role: "forged" },
  ])
    await assert.rejects(() =>
      transport(`${origin}/rest/v1/rpc/mundialito_save_player_cards`, {
        method: "POST",
        body: JSON.stringify(changed),
      }),
    );
  await assert.rejects(() =>
    readonlyFetch(origin)(
      `${origin}/rest/v1/rpc/mundialito_save_player_cards`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  );
});
test("cantidades: fotografía pública incluye acta cero y rechaza certificar un marcador leído distinto", async () => {
  const snapshot = mapSupabaseCalendar(calendarRows());
  const m = snapshot.metadata.matches[0];
  snapshot.data.results = [
    {
      matchId: m.localId,
      state: "confirmed",
      homeTeamId: snapshot.data.fixtures[0].homeTeamId!,
      awayTeamId: snapshot.data.fixtures[0].awayTeamId!,
      homeGoals: 0,
      awayGoals: 0,
    },
  ];
  m.status = "finished";
  let changed = false;
  const client = createClient("https://cards.example.test", "test", {
    global: {
      fetch: async () =>
        Response.json(
          snapshot.metadata.matches.map((row) => ({
            match_id: row.id,
            tournament_id: snapshot.metadata.tournament.id,
            status: row.status,
            phase: row.phase,
            home_team_id: row.homeTeamId,
            away_team_id: row.awayTeamId,
            home_score: row.id === m.id && changed ? 1 : 0,
            away_score: 0,
            cards_complete: row.id === m.id,
            events: [],
          })),
          { headers: { "content-range": "0-33/34" } },
        ),
    },
  });
  assert.deepEqual((await readCardSnapshot(client, snapshot)).coverage, [
    m.localId,
  ]);
  changed = true;
  assert.deepEqual((await readCardSnapshot(client, snapshot)).coverage, []);
});
test("cantidades: expulsión second-yellow conserva dos amarillas y genera un partido de suspensión sin sumar 4", () => {
  const data = mapSupabaseCalendar(calendarRows()).data,
    f = data.fixtures[0],
    team = f.homeTeamId!;
  data.players = [
    {
      id: "p",
      name: "Jugador",
      slug: "jugador--p",
      teamId: team,
      shirtNumber: null,
    },
  ];
  data.results = [
    {
      matchId: f.id,
      state: "confirmed",
      homeTeamId: team,
      awayTeamId: f.awayTeamId!,
      homeGoals: 0,
      awayGoals: 0,
    },
  ];
  data.events = ["yellow", "yellow", "second-yellow"].map((kind, i) => ({
    id: `c${i}`,
    matchId: f.id,
    teamId: team,
    playerId: "p",
    kind: kind as "yellow" | "second-yellow",
  }));
  assert.deepEqual(disciplineSummary(data.events), {
    points: 3,
    yellows: 2,
    reds: 1,
  });
  const warning = suspensionWarnings(data, [
    {
      id: f.id,
      homeTeamId: team,
      awayTeamId: f.awayTeamId,
      startsAt: "2026-10-01T10:00:00Z",
      status: "finished",
    },
    {
      id: "next",
      homeTeamId: team,
      awayTeamId: f.awayTeamId,
      startsAt: "2026-10-08T10:00:00Z",
      status: "scheduled",
    },
  ])[0];
  assert.equal(warning.matches, 1);
  assert.equal(warning.nextMatchId, "next");
});

test("cantidades: minutos incoherentes no generan una cronología ficticia", () => {
  assert.throws(
    () =>
      cardValues(
        {
          ...raw,
          yellows: "1",
          direct_reds: "1",
          yellow_minute_0: "30",
          red_minute: "20",
        },
        empty,
      ),
    /preceder/,
  );
  assert.throws(
    () =>
      cardValues(
        {
          ...raw,
          yellow_minute_0: "20",
          yellow_minute_1: "60",
          red_minute: "50",
        },
        empty,
      ),
    /segunda/,
  );
  assert.equal(
    cardValues(
      { ...raw, yellow_minute_0: "20", yellow_minute_1: "", red_minute: "" },
      empty,
    ).redMinute,
    null,
  );
});

test("minuto rojo: cinco casos permitidos, NULL y conservación al cambiar cantidades", () => {
  for (const [y, r] of [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
  ]) {
    const v = cardValues(
      {
        ...raw,
        yellows: String(y),
        direct_reds: String(r),
        yellow_minute_0: "",
        yellow_minute_1: "",
        red_minute: "",
      },
      empty,
    );
    assert.equal(v.redMinute, null);
    if (y === 2 || r === 1)
      assert.equal(
        cardValues(
          {
            ...raw,
            yellows: String(y),
            direct_reds: String(r),
            yellow_minute_0: "",
            yellow_minute_1: "",
            red_minute: "75",
          },
          empty,
        ).redMinute,
        75,
      );
  }
  const red = { ...card(1003, "red_card", "direct"), minute: 75 };
  const state = { ...empty, events: [card(1001), red] };
  const v = cardValues(
    {
      ...raw,
      yellows: "1",
      direct_reds: "1",
      yellow_id_0: uuid(1001),
      yellow_minute_0: "20",
      red_minute: "",
    },
    state,
  );
  assert.equal(v.redMinute, 75);
  assert.equal(v.clearRedMinute, false);
  assert.equal(state.events[1].notes, "Conservar nota");
  assert.equal(v.yellowCards[0].id, uuid(1001));
  assert.equal(
    cardValues(
      { ...raw, yellows: "0", direct_reds: "1", red_minute: "" },
      state,
    ).redMinute,
    75,
  );
  assert.equal(
    cardValues(
      {
        ...raw,
        yellows: "1",
        direct_reds: "0",
        yellow_id_0: uuid(1001),
        red_minute: "",
      },
      state,
    ).redMinute,
    null,
  );
  assert.equal(
    cardValues(
      {
        ...raw,
        yellows: "0",
        direct_reds: "1",
        red_minute: "",
        clear_red_minute: "on",
      },
      state,
    ).redMinute,
    null,
  );
  assert.throws(
    () =>
      cardValues(
        {
          ...raw,
          yellows: "0",
          direct_reds: "1",
          red_minute: "75",
          clear_red_minute: "on",
        },
        state,
      ),
    /borrar/,
  );
});
test("cantidades: lectura certificada mapea doble amarilla al motor; acta invalidada vuelve a puntos pendientes", async () => {
  const previous = process.env.SUPABASE_PHASE4_CARDS_ENABLED;
  process.env.SUPABASE_PHASE4_CARDS_ENABLED = "true";
  try {
    const snapshot = mapSupabaseCalendar(calendarRows()),
      m = snapshot.metadata.matches[0],
      fixture = snapshot.data.fixtures[0];
    m.status = "finished";
    snapshot.data.results = [
      {
        matchId: m.localId,
        state: "confirmed",
        homeTeamId: fixture.homeTeamId!,
        awayTeamId: fixture.awayTeamId!,
        homeGoals: 0,
        awayGoals: 0,
      },
    ];
    const e = [
      card(1001),
      card(1002),
      card(1003, "red_card", "second_yellow"),
    ].map((c) => ({ ...c, match_id: m.id, team_id: m.homeTeamId }));
    let certified = true;
    const client = createClient("https://cards.example.test", "test", {
      global: {
        fetch: async (input) => {
          const url = new URL(String(input));
          const table = url.pathname.split("/").at(-1);
          const rows =
            table === "players"
              ? [
                  {
                    id: scope.playerId,
                    tournament_id: uuid(1),
                    team_id: m.homeTeamId,
                    full_name: "Jugador Oficial",
                    slug: "jugador",
                    shirt_number: null,
                    position: null,
                    is_active: true,
                    created_at: "2026-01-01",
                    updated_at: "2026-01-01",
                  },
                ]
              : table === "match_events"
                ? e
                : table === "mundialito_public_decisions" ? []
                : snapshot.metadata.matches.map((r) => ({
                    match_id: r.id,
                    tournament_id: uuid(1),
                    status: r.status,
                    phase: r.phase,
                    home_team_id: r.homeTeamId,
                    away_team_id: r.awayTeamId,
                    home_score: 0,
                    away_score: 0,
                    cards_complete: certified && r.id === m.id,
                    events: r.id === m.id ? e : [],
                  }));
          return Response.json(rows, {
            headers: { "content-range": `0-${rows.length - 1}/${rows.length}` },
          });
        },
      },
    });
    const enriched = await enrichWithEvents(client, snapshot);
    assert.deepEqual(enriched.data.disciplineCoverage, [m.localId]);
    assert.deepEqual(disciplineSummary(enriched.data.events), {
      points: 3,
      yellows: 2,
      reds: 1,
    });
    assert.equal(enriched.data.events[2].kind, "second-yellow");
    certified = false;
    const pending = await enrichWithEvents(client, snapshot);
    assert.deepEqual(pending.data.disciplineCoverage, []);
    assert.deepEqual(disciplineSummary(pending.data.events), {
      points: null,
      yellows: 2,
      reds: 1,
    });
  } finally {
    if (previous === undefined)
      delete process.env.SUPABASE_PHASE4_CARDS_ENABLED;
    else process.env.SUPABASE_PHASE4_CARDS_ENABLED = previous;
  }
});
test("cantidades: panel móvil renderiza selección por equipo y jugador sin selector de causa", () => {
  const code = ts.transpileModule(
    readFileSync(
      new URL("../../src/app/(torneo)/mundialito/admin/partidos/card-panel.tsx", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const exports: Record<string, unknown> = {},
    require = createRequire(import.meta.url);
  runInNewContext(code, {
    exports,
    require: (id: string) =>
      id === "next/navigation" ? {useRouter:()=>({refresh(){}})} : id === "./card-actions"
        ? {
            loadCardsAction: async () => ({ error: "" }),
            saveCardsAction: async () => ({ error: "" }),
          }
        : id === "@/lib/mundialito/events/cards"
          ? cardsModule
          : id === "../admin.module.css"
            ? { __esModule: true, default: {} }
            : require(id),
  });
  const Panel = exports.CardPanel as React.ComponentType<
    Record<string, unknown>
  >;
  const html = renderToStaticMarkup(
    React.createElement(Panel, {
      matchId: scope.matchId,
      teams: [{ id: scope.teamId, name: "La Bomba" }],
      players: [],
    }),
  );
  assert.match(html, /Tarjetas por jugador/);
  assert.match(html, /Revisar cantidades/);
  assert.doesNotMatch(html, /name="dismissal_cause"/);
  assert.match(html, /disabled/);
});

function isolatedCards(t: { after(fn: () => void): void }) {
  const values = { NEXT_PUBLIC_SUPABASE_URL: "https://cards.example.test", SUPABASE_PHASE4_ISOLATED_URL: "https://cards.example.test", SUPABASE_PHASE4_WRITE_TARGET: "isolated", SUPABASE_PHASE4_READ_ENABLED: "true", SUPABASE_PHASE4_CARD_WRITES_ENABLED: "true" };
  const previous = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
}
