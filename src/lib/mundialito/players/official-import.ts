import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildImportPreview,
  sha256,
  type RosterFile,
  type PreviewEntry,
} from "./import-preview.ts";
import {
  normalizePlayerName,
  RosterError,
  type RosterPlayer,
  type RosterContext,
} from "./model.ts";
import {
  readPlayers,
  readRosterContext,
  PLAYER_COLUMNS,
} from "./repository.ts";

export const OFFICIAL_FILES = [
  {
    file: "Nomina_La_Bomba.txt",
    slug: "la-bomba",
    count: 17,
    hash: "64a192c915ff50006524e264fa372c1ec6fc8a9aea30a3cc961136ed3ffe8357",
  },
  {
    file: "Nomina_Sagrado.txt",
    slug: "sagrado",
    count: 21,
    hash: "d30d0b70cc77e805d692916c1edf9306d5b23ba72cb01a33daeff65de8a1edb0",
  },
  {
    file: "Nomina_San_Julian.txt",
    slug: "san-julian",
    count: 23,
    hash: "7c81d331d674db334320bbbb7ff74c3673acdac8417b2a871cb29410e5038dec",
  },
  {
    file: "Nomina_Villa_Hermosa.txt",
    slug: "villa-hermosa",
    count: 24,
    hash: "6a57e9a8c52b0751421d71d7e88ef67aee07e8be87e694887d4bf74e308aaecb",
  },
] as const;
// Case and whitespace comparisons retain accents. Accent-only similarities require review.
const exactName = (s: string) =>
  s.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
export interface OfficialTarget {
  file: string;
  line: number;
  teamSlug: string;
  name: string;
  proposal: NonNullable<PreviewEntry["proposal"]>;
}
export function officialTargets(files: RosterFile[], context: RosterContext) {
  if (files.length !== 4)
    throw new RosterError(
      "FILES",
      "Esta autorización comprende exactamente cuatro archivos.",
    );
  const selected = OFFICIAL_FILES.map((policy) => {
    const matches = files.filter((f) => f.name === policy.file);
    if (matches.length !== 1 || matches[0].sha256 !== policy.hash)
      throw new RosterError(
        "FILES",
        "Una nómina original falta o cambió. No se importará una versión diferente sin revisión.",
      );
    const f = matches[0];
    return {
      ...f,
      text:
        // The approved source hash was checked above; only its authorized row 5 loses one trailing ASCII space.
        policy.slug === "villa-hermosa"
          ? f.text.replace(/(^5\. [^\r\n]*\S) (?=\r?$)/m, "$1")
          : f.text,
    };
  });
  const preview = buildImportPreview(selected, context, []);
  const targets: OfficialTarget[] = [];
  preview.reports.forEach((report, i) => {
    const policy = OFFICIAL_FILES[i];
    if (
      report.team?.slug !== policy.slug ||
      report.entries.filter((e) => e.name?.trim()).length !== policy.count
    )
      throw new RosterError(
        "FILES",
        "El equipo o número de nombres no coincide con la autorización.",
      );
    for (const entry of report.entries) {
      if (entry.status === "header" || entry.status === "blank") continue;
      if (
        policy.slug === "san-julian" &&
        (entry.raw === "24." || entry.raw === "25.")
      )
        continue;
      if (entry.status !== "create" || !entry.proposal || !entry.name)
        throw new RosterError(
          "FILES",
          "La nómina contiene una incidencia no autorizada. Requiere revisión.",
        );
      targets.push({
        file: report.file,
        line: entry.line,
        teamSlug: policy.slug,
        name: entry.name,
        proposal: entry.proposal,
      });
    }
  });
  if (targets.length !== 85)
    throw new RosterError("FILES", "Se esperaban 85 nombres válidos.");
  return { targets, sourceHash: sha256(JSON.stringify(targets)) };
}
export function classifyTarget(
  target: OfficialTarget,
  players: RosterPlayer[],
) {
  const p = target.proposal,
    roster = players.filter((r) => r.teamId === p.team_id);
  const exact = roster.filter(
    (r) => exactName(r.fullName) === exactName(target.name),
  );
  const loose = roster.filter(
    (r) => normalizePlayerName(r.fullName) === normalizePlayerName(target.name),
  );
  if (exact.length > 1 || loose.length > exact.length)
    return {
      status: "review" as const,
      reason:
        "Nombre ambiguo, homónimo o diferencia de tildes: no se fusionan fichas.",
      player: null,
    };
  const identity = players.find((r) => r.id === p.id);
  if (
    identity &&
    (identity.teamId !== p.team_id ||
      exactName(identity.fullName) !== exactName(target.name))
  )
    return {
      status: "review" as const,
      reason: "El UUID propuesto corresponde a otra identidad.",
      player: null,
    };
  if (exact.length === 1)
    return {
      status: "existing" as const,
      reason: "Se conserva la ficha existente sin cambios.",
      player: exact[0],
    };
  if (roster.some((r) => r.slug === p.slug))
    return {
      status: "review" as const,
      reason: "Slug ocupado por otra ficha.",
      player: null,
    };
  return {
    status: "create" as const,
    reason: "Nuevo jugador; dorsal y posición NULL.",
    player: null,
  };
}
export async function verifyImportAdmin(client: SupabaseClient) {
  const identity = await client.auth.getUser();
  if (identity.error || !identity.data.user?.id)
    throw new RosterError(
      "ACCESS",
      "La importación requiere iniciar sesión como administrador.",
    );
  const permission = await client.rpc("is_mundialito_admin", undefined, {
    get: true,
  });
  if (permission.error || permission.data !== true)
    throw new RosterError(
      "ACCESS",
      "No se autorizó esta importación. No se escribirá sin permiso administrativo.",
    );
  return identity.data.user.id;
}
export async function officialPlan(
  client: SupabaseClient,
  files: RosterFile[],
) {
  const context = await readRosterContext(client),
    baseline = await readPlayers(client, context);
  const source = officialTargets(files, context);
  const entries = source.targets.map((t) => ({
    ...t,
    ...classifyTarget(t, baseline),
  }));
  const planHash = sha256(
    JSON.stringify({ sourceHash: source.sourceHash, baseline }),
  );
  return { ...source, context, baseline, entries, planHash };
}
export type OfficialPlan = Awaited<ReturnType<typeof officialPlan>>;
export interface ImportOutcome {
  index: number;
  teamSlug: string;
  name: string;
  id: string | null;
  status: "inserted" | "existing" | "review";
  detail: string;
}
export interface OfficialRun {
  version: 1;
  id: string;
  owner: string;
  createdAt: string;
  sourceHash: string;
  planHash: string;
  baseline: RosterPlayer[];
  targets: OfficialTarget[];
  cursor: number;
  outcomes: ImportOutcome[];
  attempted: string[];
  error: string;
  errors: { at: string; index: number; code: string; message: string }[];
  complete: boolean;
  verification: ReturnType<typeof verifyOfficialRows> | null;
}
export async function createOfficialRun(
  client: SupabaseClient,
  files: RosterFile[],
  expectedPlanHash: string,
): Promise<OfficialRun> {
  const owner = await verifyImportAdmin(client),
    plan = await officialPlan(client, files);
  if (expectedPlanHash !== plan.planHash)
    throw new RosterError(
      "CHANGED",
      "Los datos cambiaron desde la vista previa. Recarga para revisar el nuevo plan.",
    );
  return {
    version: 1,
    id: randomUUID(),
    owner,
    createdAt: new Date().toISOString(),
    sourceHash: plan.sourceHash,
    planHash: plan.planHash,
    baseline: plan.baseline,
    targets: plan.targets,
    cursor: 0,
    outcomes: [],
    attempted: [],
    error: "",
    errors: [],
    complete: false,
    verification: null,
  };
}
export function verifyOfficialRows(run: OfficialRun, players: RosterPlayer[]) {
  const confirmedPresent = run.outcomes.every(
    (o) =>
      o.status === "review" ||
      players.some(
        (p) =>
          p.id === o.id &&
          p.teamId === run.targets[o.index].proposal.team_id &&
          exactName(p.fullName) === exactName(o.name),
      ),
  );
  const preserved = run.baseline.every((before) => {
    const after = players.find((p) => p.id === before.id);
    return after && JSON.stringify(after) === JSON.stringify(before);
  });
  const insertedIds = new Set(
    run.outcomes.filter((o) => o.status === "inserted").map((o) => o.id),
  );
  const newRows = players.filter((p) => insertedIds.has(p.id));
  const newDefaultsValid =
    newRows.length === insertedIds.size &&
    newRows.every((p) => {
      const target = run.targets.find((t) => t.proposal.id === p.id);
      return (
        target &&
        p.fullName === target.name &&
        p.slug === target.proposal.slug &&
        p.teamId === target.proposal.team_id &&
        p.tournamentId === target.proposal.tournament_id &&
        p.shirtNumber === null &&
        p.position === null &&
        p.active
      );
    });
  const teams = OFFICIAL_FILES.map((policy) => {
    const target = run.targets.find((t) => t.teamSlug === policy.slug)!;
    const roster = players.filter((p) => p.teamId === target.proposal.team_id);
    const duplicates = roster.filter(
      (p, i) =>
        roster.findIndex(
          (r) => exactName(r.fullName) === exactName(p.fullName),
        ) !== i,
    ).length;
    const outcomes = run.outcomes.filter((o) => o.teamSlug === policy.slug);
    return {
      team: policy.slug,
      validNames: policy.count,
      total: roster.length,
      inserted: outcomes.filter((o) => o.status === "inserted").length,
      existing: outcomes.filter((o) => o.status === "existing").length,
      pending:
        policy.count - outcomes.filter((o) => o.status !== "review").length,
      duplicates,
    };
  });
  return {
    totalTournament: players.length,
    confirmedPresent,
    preserved,
    newDefaultsValid,
    teams,
    verifiedAt: new Date().toISOString(),
  };
}
export async function executeOfficialBatch(
  client: SupabaseClient,
  files: RosterFile[],
  run: OfficialRun,
  persist: (run: OfficialRun) => Promise<void>,
) {
  const owner = await verifyImportAdmin(client);
  if (owner !== run.owner)
    throw new RosterError(
      "ACCESS",
      "Esta ejecución pertenece a otra sesión administrativa.",
    );
  const context = await readRosterContext(client),
    source = officialTargets(files, context);
  if (
    source.sourceHash !== run.sourceHash ||
    JSON.stringify(source.targets) !== JSON.stringify(run.targets)
  )
    throw new RosterError(
      "CHANGED",
      "El origen autorizado cambió; se detuvo la importación.",
    );
  run.error = "";
  try {
    const before = await readPlayers(client, context);
    const beforeCheck = verifyOfficialRows(run, before);
    if (!beforeCheck.preserved)
      throw new RosterError(
        "CHANGED",
        "Una ficha preexistente cambió desde el plan. Se detuvo para revisión.",
      );
    if (
      !beforeCheck.confirmedPresent ||
      !beforeCheck.newDefaultsValid ||
      beforeCheck.teams.some((t) => t.duplicates)
    )
      throw new RosterError(
        "CHANGED",
        "La verificación previa detectó cambios o duplicados. No se insertarán más filas hasta revisarlo.",
      );
    const end = Math.min(run.cursor + 5, run.targets.length);
    while (run.cursor < end) {
      const index = run.cursor,
        t = run.targets[index],
        current = await readPlayers(client, context);
      const decision = classifyTarget(t, current);
      if (decision.status === "review")
        run.outcomes.push({
          index,
          teamSlug: t.teamSlug,
          name: t.name,
          id: null,
          status: "review",
          detail: decision.reason,
        });
      else if (decision.status === "existing") {
        const recovered =
          run.attempted.includes(decision.player!.id) &&
          !run.baseline.some((p) => p.id === decision.player!.id);
        if (
          recovered &&
          (decision.player!.shirtNumber !== null ||
            decision.player!.position !== null ||
            !decision.player!.active ||
            decision.player!.fullName !== t.name ||
            decision.player!.slug !== t.proposal.slug)
        )
          throw new RosterError(
            "CHANGED",
            "La ficha de un intento previo cambió. Revisión necesaria.",
          );
        run.outcomes.push({
          index,
          teamSlug: t.teamSlug,
          name: t.name,
          id: decision.player!.id,
          status: recovered ? "inserted" : "existing",
          detail: recovered
            ? "Alta confirmada al reanudar el mismo intento."
            : decision.reason,
        });
      } else {
        if (!run.attempted.includes(t.proposal.id))
          run.attempted.push(t.proposal.id);
        await persist(run); // Durable intent precedes the single INSERT; no UPDATE/upsert path exists.
        const response = await client
          .from("players")
          .insert(t.proposal)
          .select(PLAYER_COLUMNS)
          .single();
        // Even a duplicate-PK race is resolved by rereading the exact proposed UUID.
        if (response.error && response.error.code !== "23505")
          throw new RosterError(
            response.error.code ?? "INSERT",
            response.error.code === "42501"
              ? "RLS rechazó el alta. Revisa la sesión; la ejecución se detuvo."
              : "Supabase no confirmó el alta. La ejecución se detuvo; reanuda este mismo registro para comprobarlo.",
          );
        const after = await readPlayers(client, context),
          row = after.find((p) => p.id === t.proposal.id);
        const resolved = classifyTarget(t, after);
        if (
          !row ||
          resolved.status !== "existing" ||
          resolved.player?.id !== row.id ||
          row.fullName !== t.name ||
          row.slug !== t.proposal.slug ||
          row.shirtNumber !== null ||
          row.position !== null ||
          !row.active
        )
          throw new RosterError(
            "CONFIRMATION",
            "El alta o su unicidad no pudo confirmarse. No se continuará ciegamente.",
          );
        run.outcomes.push({
          index,
          teamSlug: t.teamSlug,
          name: t.name,
          id: row.id,
          status: "inserted",
          detail: "Alta confirmada por lectura posterior de Supabase.",
        });
      }
      run.cursor++;
      await persist(run);
    }
    const players = await readPlayers(client, context);
    run.verification = verifyOfficialRows(run, players);
    if (
      !run.verification.preserved ||
      !run.verification.confirmedPresent ||
      !run.verification.newDefaultsValid ||
      run.verification.teams.some((t) => t.duplicates)
    )
      throw new RosterError(
        "VERIFICATION",
        "La verificación detectó cambios o duplicados. La ejecución se detuvo para revisión.",
      );
    run.complete = run.cursor === run.targets.length;
  } catch (error) {
    run.error =
      error instanceof RosterError
        ? error.message
        : "Error de conexión o confirmación. Se detuvo la ejecución; reanuda la misma ejecución para comprobar su estado.";
    run.errors.push({
      at: new Date().toISOString(),
      index: run.cursor,
      code: error instanceof RosterError ? error.code : "UNCONFIRMED",
      message: run.error,
    });
  }
  await persist(run);
  return run;
}
