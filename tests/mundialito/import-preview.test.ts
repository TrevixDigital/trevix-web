import test from "node:test";
import assert from "node:assert/strict";
import {
  buildImportPreview,
  decodeRosterFile,
  importPlayerId,
  selectManifestFiles,
} from "../../src/lib/mundialito/players/import-preview.ts";
import {
  isUuid,
  type RosterContext,
  type RosterPlayer,
} from "../../src/lib/mundialito/players/model.ts";
import { readonlyFetch } from "../../src/lib/mundialito/supabase/readonly-fetch.ts";
import { uuid } from "./supabase-fixtures.ts";
const context: RosterContext = {
  tournamentId: uuid(1),
  teams: [
    { id: uuid(100), name: "San Julián", slug: "san-julian", group: "B" },
    { id: uuid(101), name: "Sagrado", slug: "sagrado", group: "B" },
    {
      id: uuid(102),
      name: "2.da Del Sagrado",
      slug: "2da-del-sagrado",
      group: "B",
    },
  ],
};
const file = (text: string, name = "Nomina_San_Julian.txt") =>
  decodeRosterFile(name, Buffer.from(text, "utf8"));
const preview = (text: string, existing: RosterPlayer[] = []) =>
  buildImportPreview([file(text)], context, existing);

test("importación: manifiesto congela archivos y no incorpora una nómina nueva", () => {
  const original = file("José Pérez"),
    other = file("Persona Ficticia A", "Nomina_Sagrado.txt");
  const manifest = buildImportPreview([original], context, []);
  const scope = selectManifestFiles(
    [original, other],
    manifest,
    context.tournamentId,
  );
  assert.deepEqual(scope.selected, [original]);
  assert.deepEqual(scope.additionalFiles, [other.name]);
  assert.equal(
    buildImportPreview(scope.selected, context, []).planHash,
    manifest.planHash,
  );
});
test("importación: manifiesto rechaza archivos modificados, ausentes, repetidos y otro torneo", () => {
  const original = file("José Pérez"),
    manifest = buildImportPreview([original], context, []);
  assert.throws(() =>
    selectManifestFiles(
      [file("José Corregido")],
      manifest,
      context.tournamentId,
    ),
  );
  assert.throws(() => selectManifestFiles([], manifest, context.tournamentId));
  assert.throws(() => selectManifestFiles([original], manifest, uuid(999)));
  assert.throws(() =>
    selectManifestFiles(
      [original],
      { ...manifest, reports: [...manifest.reports, ...manifest.reports] },
      context.tournamentId,
    ),
  );
  assert.throws(() =>
    selectManifestFiles(
      [original],
      {
        ...manifest,
        reports: [{ ...manifest.reports[0], file: "../secret.txt" }],
      },
      context.tournamentId,
    ),
  );
});
test("importación: reconoce equipo por nombre completo, título e índices, nunca dorsales", () => {
  const p = preview(
    "Nomina_San_Julian\r\n1. José De La Cruz\r\n2. María Ñáñez\r\n",
  );
  assert.equal(p.reports[0].team!.id, uuid(100));
  assert.equal(p.summary.create, 2);
  assert.equal(p.summary.blank, 0);
  assert.equal(p.reports[0].entries[0].status, "header");
  assert.equal(p.reports[0].entries[1].proposal!.full_name, "José De La Cruz");
  assert.equal(p.reports[0].entries[1].proposal!.shirt_number, null);
  assert.equal(p.reports[0].entries[1].proposal!.position, null);
  assert.ok(isUuid(p.reports[0].entries[1].proposal!.id));
  assert.match(p.reports[0].entries[1].proposal!.slug, /^jose-de-la-cruz--/);
});
test("importación: no asocia nombres parciales ni escoge ante ambigüedad", () => {
  const p = buildImportPreview(
    [file("1. José Pérez", "Nomina_Sagra.txt")],
    context,
    [],
  );
  assert.equal(p.reports[0].team, null);
  assert.equal(p.summary.create, 0);
  const ambiguous = {
    ...context,
    teams: [context.teams[0], { ...context.teams[0], id: uuid(999) }],
  };
  assert.equal(
    buildImportPreview([file("1. José Pérez")], ambiguous, []).summary.review,
    1,
  );
  const sagrado = buildImportPreview(
    [file("1. José Pérez", "Nomina_Sagrado.txt")],
    context,
    [],
  );
  assert.equal(sagrado.reports[0].team!.id, uuid(101));
});
test("importación: espacios, líneas vacías y números vacíos no se corrigen ni importan", () => {
  const p = preview(
    "Nomina_San_Julian\n1. Nombre Legítimo \n2.\n\n3. Otro Nombre",
  );
  assert.equal(p.summary.detectedPlayers, 2);
  assert.equal(p.summary.review, 2);
  assert.equal(p.summary.blank, 1);
  assert.equal(p.reports[0].entries[1].name, "Nombre Legítimo ");
  assert.equal(p.reports[0].entries[1].raw, "1. Nombre Legítimo ");
  assert.equal(p.reports[0].entries[2].proposal, undefined);
});
test("importación: duplicados se revisan en todas sus apariciones sin colapsar homónimos", () => {
  const p = preview("1. José Pérez\n2. JOSE PEREZ");
  assert.equal(p.summary.review, 2);
  assert.equal(p.summary.create, 0);
  const both = buildImportPreview(
    [file("José Pérez"), file("José Pérez", "San_Julian.txt")],
    context,
    [],
  );
  assert.equal(both.summary.review, 2);
});
test("importación: simulación repetida estable, orden independiente e identidades por equipo/torneo", () => {
  const a = preview("1. José Pérez\n2. Persona Ficticia A"),
    b = preview("1. Persona Ficticia A\n2. José Pérez");
  assert.equal(
    a.reports[0].entries[0].proposal!.id,
    b.reports[0].entries[1].proposal!.id,
  );
  assert.equal(preview("1. José Pérez\n2. Persona Ficticia A").planHash, a.planHash);
  assert.notEqual(
    importPlayerId(uuid(1), uuid(100), "José Pérez"),
    importPlayerId(uuid(1), uuid(101), "José Pérez"),
  );
  assert.notEqual(
    importPlayerId(uuid(1), uuid(100), "José Pérez"),
    importPlayerId(uuid(2), uuid(100), "José Pérez"),
  );
});
test("importación: repetir contra filas ya creadas omite, no sobrescribe dorsal/posición/estado", () => {
  const initial = preview("1. José Pérez"),
    proposed = initial.reports[0].entries[0].proposal!;
  const existing: RosterPlayer = {
    id: proposed.id,
    tournamentId: proposed.tournament_id,
    teamId: proposed.team_id,
    fullName: proposed.full_name,
    slug: proposed.slug,
    shirtNumber: 9,
    position: "forward",
    active: false,
    updatedAt: "2026-01-01T00:00:00Z",
  };
  const before = structuredClone(existing),
    p = preview("1. José Pérez", [existing]);
  assert.equal(p.summary.omit, 1);
  assert.equal(p.summary.create, 0);
  assert.deepEqual(existing, before);
  assert.equal(preview("1. JOSE PEREZ", [existing]).summary.review, 1);
  assert.equal(
    preview("1. José Pérez", [existing, { ...existing, id: uuid(901) }]).summary
      .review,
    1,
  );
});
test("importación: slug ocupado y UUID con identidad distinta exigen revisión", () => {
  const p = preview("José Pérez").reports[0].entries[0].proposal!;
  const existing: RosterPlayer = {
    id: uuid(901),
    tournamentId: uuid(1),
    teamId: uuid(100),
    fullName: "Otro Nombre",
    slug: p.slug,
    shirtNumber: null,
    position: null,
    active: true,
    updatedAt: "2026-01-01T00:00:00Z",
  };
  assert.equal(preview("José Pérez", [existing]).summary.review, 1);
  assert.equal(
    preview("José Pérez", [{ ...existing, id: p.id, slug: "otro" }]).summary
      .review,
    1,
  );
});
test("importación: UTF-8/tildes/BOM, UTF-16 con BOM e inválido sin reemplazos silenciosos", () => {
  assert.equal(
    decodeRosterFile("a.txt", Buffer.from("\ufeffJosé Ñáñez")).text,
    "José Ñáñez",
  );
  const utf16 = Buffer.concat([
    Buffer.from([255, 254]),
    Buffer.from("José Ñáñez", "utf16le"),
  ]);
  assert.equal(decodeRosterFile("a.txt", utf16).text, "José Ñáñez");
  assert.throws(() => decodeRosterFile("a.txt", Buffer.from([0xc3, 0x28])));
  assert.equal(preview("José\u200b Pérez").summary.review, 1);
});
test("importación: numeración fuera de secuencia requiere revisión y especiales legítimos se conservan", () => {
  const p = preview("1. Anne-Marie O’Neil\n1. Ana María");
  assert.equal(p.summary.create, 1);
  assert.equal(p.summary.review, 1);
  assert.equal(
    p.reports[0].entries[0].proposal!.full_name,
    "Anne-Marie O’Neil",
  );
});
test("importación: transporte de simulación bloquea INSERT, UPDATE, DELETE y RPC antes de red", async () => {
  let calls = 0;
  const f = readonlyFetch("https://example.test", async () => {
    calls++;
    return new Response("[]");
  });
  for (const method of ["POST", "PATCH", "PUT", "DELETE"])
    await assert.rejects(
      f("https://example.test/rest/v1/players", { method, body: "{}" }),
    );
  await assert.rejects(
    f("https://example.test/rest/v1/rpc/is_mundialito_admin"),
  );
  assert.equal(calls, 0);
});
