import type { SupabaseClient } from "@supabase/supabase-js";
import { createTournamentReader, READ_COLUMNS } from "../supabase/reader.ts";
import {
  readSupabaseCalendar,
  mapSupabaseCalendar,
} from "../adapters/supabase-calendar.ts";
import { calculateTournament } from "../engine/tournament.ts";
import { checkAdminAccess } from "../admin/access.ts";
import { isUuid, RosterError } from "../players/model.ts";
import {
  validateMatchValues,
  MATCH_FIELDS,
  localMatchDate,
  type MatchValues,
} from "./model.ts";
import type { ReadRow, SupabaseCalendarRows } from "../supabase/read-types.ts";
import { enrichWithEvents } from "../events/read.ts";
import { createCompetitionReport } from "../repositories/competition-report.ts";
import { calendarIntegrity } from "./integrity.ts";
import { phase4Capabilities } from "../events/capabilities.ts";
import { applyClassificationDecisions } from "../events/classification-decisions.ts";
import { assertKnockoutDependencies,knockoutProgressionEnabled } from "./progression.ts";
export async function readAdminMatches(
  client: SupabaseClient,
  includeEvents = false,
) {
  const reader = createTournamentReader(client),
    rows: Partial<SupabaseCalendarRows> = {};
  const withEvidence=includeEvents||phase4Capabilities().read;
  const snapshot = await readSupabaseCalendar({
    async read(table, filter) {
      const data = await reader.read(table, filter);
      rows[table] = data;
      return data;
    },
  },{deferKnockoutVerification:withEvidence});
  const records = rows.matches!;
  for (const r of records)
    if (
      typeof r.updated_at !== "string" ||
      !Number.isFinite(Date.parse(r.updated_at))
    )
      throw new RosterError("DATA", "Falta la versión del encuentro.");
  const enriched = withEvidence
    ? await enrichWithEvents(client, snapshot)
    : null;
  const competition = createCompetitionReport(enriched?.data ?? snapshot.data);
  return {
    ...snapshot,
    rows: rows as SupabaseCalendarRows,
    records,
    ...(enriched ?? {}),
    snapshot: competition.calculation,
    competition,
    integrity: calendarIntegrity(rows as SupabaseCalendarRows),
  };
}
const immutable = [
  "id",
  "tournament_id",
  "matchday_id",
  "match_number",
  "phase",
  "bracket_code",
  "group_id",
  "home_team_id",
  "away_team_id",
  "home_source",
  "away_source",
];
function sameValues(a: ReadRow, b: MatchValues) {
  return MATCH_FIELDS.every((k) =>
    k === "scheduled_at"
      ? (!a[k] && !b[k]) ||
        (typeof a[k] === "string" &&
          Date.parse(a[k] as string) === Date.parse(b[k] ?? ""))
      : a[k] === b[k],
  );
}
export async function saveAdminMatch(
  client: SupabaseClient,
  input: {
    id: string;
    version: string;
    values: Record<string, unknown>;
    confirmed: boolean;
  },
) {
  let user = "";
  const access = await checkAdminAccess({
    async getVerifiedUser() {
      const r = await client.auth.getUser();
      user = r.data.user?.id ?? "";
      return { user: r.data.user, error: r.error };
    },
    async isAdmin() {
      return client.rpc("is_mundialito_admin", undefined, { get: true });
    },
  });
  if (access !== "allowed")
    throw new RosterError(
      "ACCESS",
      "No se autorizó el guardado del partido. Inicia sesión con un usuario administrador.",
    );
  if (!isUuid(input.id) || typeof input.version !== "string")
    throw new RosterError("VALIDATION", "Identidad o versión inválida.");
  const context = await readAdminMatches(client),
    before = context.records.find((r) => r.id === input.id);
  if (!before)
    throw new RosterError(
      "NOT_FOUND",
      "Partido no disponible en el torneo oficial.",
    );
  const values = validateMatchValues(input.values, before.phase as string);
  if (
    values.scheduled_at &&
    typeof before.scheduled_at === "string" &&
    JSON.stringify(localMatchDate(values.scheduled_at)) ===
      JSON.stringify(localMatchDate(before.scheduled_at))
  )
    values.scheduled_at = before.scheduled_at;
  const changed = !sameValues(before, values);
  if (changed && before.updated_at !== input.version)
    throw new RosterError(
      "CONFLICT",
      "Otro guardado cambió el partido. Recarga antes de editar.",
    );
  if (changed && input.confirmed !== true)
    throw new RosterError(
      "CONFIRM",
      "Confirma los cambios revisados antes de guardar.",
    );
  if (
    (values.status === "finished" || values.status === "live") &&
    values.home_score !== null &&
    (!before.home_team_id || !before.away_team_id)
  )
    throw new RosterError(
      "PARTICIPANTS",
      "Faltan los equipos definidos en Supabase. No se inventarán ni se modificarán participantes desde este formulario.",
    );
  const candidate = { ...before, ...values };
  assertKnockoutDependencies(context,input.id,values);
  try {
    const adapted = mapSupabaseCalendar({
      ...context.rows,
      matches: context.records.map((r) => (r.id === input.id ? candidate : r)),
    },{deferKnockoutVerification:true});
    const confirmedIds=new Set(adapted.data.results.filter(r=>r.state==="confirmed").map(r=>r.matchId));
    const candidateData={...adapted.data,players:context.data.players,events:context.data.events,
      eventCoverage:context.data.eventCoverage.filter(id=>id!==context.metadata.matches.find(m=>m.id===input.id)!.localId),
      disciplineCoverage:context.data.disciplineCoverage.filter(id=>confirmedIds.has(id)),provisionalDisciplineCoverage:context.data.provisionalDisciplineCoverage?.filter(c=>confirmedIds.has(c.matchId))};
    calculateTournament(applyClassificationDecisions(candidateData,context.classificationRecords??[],context.metadata).data);
  } catch {
    throw new RosterError(
      "SPORTS",
      "El resultado es incompatible con las llaves o participantes confirmados. Revisa resultados posteriores y criterios pendientes del Comité.",
    );
  }
  let saved = before;
  let progression:{assigned:string[];pendingPenalties:boolean}|undefined;
  if(before.phase!=="groups"&&knockoutProgressionEnabled()) {
    const r=await client.rpc("mundialito_save_knockout",{p_match_id:input.id,p_expected_version:input.version,p_values:values});
    if(r.error)throw new RosterError(r.error.code??"PROGRESSION",`No se confirmó el resultado y avance (${r.error.code??"error"}). Puede existir una dependencia o cambio concurrente; recarga el acta. No se harán asignaciones parciales.`);
    saved=r.data?.match;
    if(!saved||!sameValues(saved,values)||immutable.some(k=>saved[k]!==before[k])||typeof saved.updated_at!=="string"||!Array.isArray(r.data?.assigned)||r.data.assigned.some((x:unknown)=>typeof x!=="string")||typeof r.data.pending_penalties!=="boolean")
      throw new RosterError("CONFIRMATION","No se recibió confirmación completa del resultado y sus cruces. Recarga antes de reintentar.");
    progression={assigned:r.data.assigned,pendingPenalties:r.data.pending_penalties};
  } else if (changed) {
    // Do not rewrite an untouched schedule (including PostgreSQL microseconds), venue or notes.
    const patch = Object.fromEntries(MATCH_FIELDS.filter(k =>
      k === "scheduled_at"
        ? (before[k] === null) !== (values[k] === null) ||
          (typeof before[k] === "string" && values[k] !== null && Date.parse(before[k]) !== Date.parse(values[k]))
        : before[k] !== values[k],
    ).map(k=>[k,values[k]]));
    const response = await client
      .from("matches")
      .update(patch)
      .eq("id", input.id)
      .eq("tournament_id", context.metadata.tournament.id)
      .eq("updated_at", input.version)
      .select(READ_COLUMNS.matches)
      .maybeSingle();
    if (response.error)
      throw new RosterError(
        response.error.code ?? "DATABASE",
        `Supabase no confirmó el cambio (${response.error.code ?? "error"}). Puede deberse a RLS, restricciones o al trigger de auditoría; no se eludirá. Revisa el partido antes de reintentar.`,
      );
    if (
      !response.data ||
      typeof response.data !== "object" ||
      Array.isArray(response.data)
    )
      throw new RosterError(
        "CONFLICT",
        "El partido cambió o no pudo actualizarse. Recarga para comprobar su estado.",
      );
    saved = response.data as unknown as ReadRow;
    if (
      !sameValues(saved, values) ||
      immutable.some((k) => saved[k] !== before[k]) ||
      typeof saved.updated_at !== "string"
    )
      throw new RosterError(
        "CONFIRMATION",
        "La respuesta no coincide con el cambio solicitado. Comprueba el partido; no repitas ciegamente.",
      );
  }
  // Existing AFTER UPDATE trigger is the only audit writer. Read its exact resulting version.
  const audit = await client
    .from("match_audit_log")
    .select("match_id,changed_by,action,old_data,new_data")
    .eq("match_id", input.id)
    .eq("changed_by", user)
    .eq("action", "UPDATE")
    .eq("new_data->>updated_at", saved.updated_at as string)
    .limit(2);
  const auditVerified =
    !audit.error &&
    audit.data?.length === 1 &&
    audit.data[0].new_data?.id === input.id &&
    immutable.every((k) => audit.data[0].new_data?.[k] === saved[k]) &&
    sameValues(audit.data[0].new_data, values) &&
    (!changed || audit.data[0].old_data?.updated_at === before.updated_at);
  return {
    id: input.id,
    localId: context.metadata.matches.find((m) => m.id === input.id)!.localId,
    number: before.match_number,
    values,
    version: saved.updated_at as string,
    repeated: !changed,
    ...(progression?{progression}:{}),
    auditVerified: !!auditVerified,
    warning: auditVerified
      ? progression?.pendingPenalties?"El encuentro terminó empatado y falta una tanda con ganador: no avanzó ningún equipo.":""
      : "El partido está guardado, pero no se pudo verificar la auditoría con esta sesión. Revisa el trigger o permisos de lectura; no repitas el UPDATE para crear otra auditoría.",
  };
}
