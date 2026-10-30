import { teams as officialTeams, groupIds } from "../data/teams.ts";
import type {
  Fixture,
  GroupId,
  Team,
  Stage,
  TournamentData,
} from "../domain/types.ts";
import { bracketDefinitions } from "../engine/bracket.ts";
import { validateTournamentData } from "../engine/validation.ts";
import { calculateTournament } from "../engine/tournament.ts";
import {
  fromSupabaseScoreColumns,
  type SupabaseScoreColumns,
} from "./match-score.ts";
import {
  TOURNAMENT_SLUG,
  TEAM_SLUG_ALIASES,
  GROUP_NAMES,
  MATCH_PHASES,
  MATCHDAY_PHASES,
  KNOCKOUT_MATCHES,
  SOURCE_REFERENCES,
  STATUSES,
} from "../supabase/calendar-mapping.ts";
import { SupabaseReadError } from "../supabase/read-types.ts";
import type {
  ReadRow,
  SupabaseCalendarRows,
  CalendarReadSnapshot,
  CalendarMetadata,
  TournamentReader,
} from "../supabase/read-types.ts";

function fail(code: string, message: string): never {
  throw new SupabaseReadError(code, message);
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim())
    fail("INVALID_FIELD", `Falta un texto válido en ${label}.`);
  return value;
}
function nullableText(value: unknown, label: string): string | null {
  return value === null ? null : text(value, label);
}
function uuid(value: unknown, label: string): string {
  const result = text(value, label);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      result,
    )
  )
    fail("INVALID_UUID", `UUID inválido en ${label}.`);
  return result.toLowerCase();
}
function nullableUuid(value: unknown, label: string): string | null {
  return value === null ? null : uuid(value, label);
}
function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    fail("INVALID_NUMBER", `Número oficial inválido en ${label}.`);
  return value;
}
function lookup<T>(
  mapping: Readonly<Record<string, T>>,
  key: string,
  label: string,
): T {
  if (!Object.hasOwn(mapping, key))
    fail(
      "UNKNOWN_MAPPING",
      `No existe correspondencia explícita para ${label}.`,
    );
  return mapping[key];
}
function ids(rows: readonly ReadRow[], label: string): void {
  const set = new Set<string>();
  for (const row of rows) {
    if (row === null || typeof row !== "object" || Array.isArray(row))
      fail("INVALID_ROW", `Fila inválida en ${label}.`);
    const id = uuid(row.id, `${label}.id`);
    if (set.has(id)) fail("DUPLICATE_UUID", `UUID repetido en ${label}.`);
    set.add(id);
  }
}
function inTournament(row: ReadRow, tournamentId: string, table: string) {
  if (uuid(row.tournament_id, `${table}.tournament_id`) !== tournamentId)
    fail(
      "WRONG_TOURNAMENT",
      `Registro de ${table} ajeno al torneo seleccionado.`,
    );
}
function scheduledAt(value: unknown): string | null {
  const raw = nullableText(value, "matches.scheduled_at");
  if (
    raw !== null &&
    (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      raw,
    ) ||
      !Number.isFinite(Date.parse(raw)))
  )
    fail(
      "AMBIGUOUS_DATE",
      "scheduled_at debe ser una fecha ISO con zona horaria explícita; no se asumirá una hora local.",
    );
  return raw;
}
/** Pure translation. Raw UUIDs, match numbers, matchdays and sources survive in metadata. */
export function mapSupabaseCalendar(
  rows: SupabaseCalendarRows,
  options?: { deferKnockoutVerification?: boolean },
): CalendarReadSnapshot {
  for (const [name, records] of Object.entries(rows)) ids(records, name);
  if (!rows.tournaments.length)
    fail(
      "TOURNAMENT_NOT_FOUND",
      `No existe o no es visible el torneo ${TOURNAMENT_SLUG}. No se seleccionará otro torneo.`,
    );
  if (rows.tournaments.length !== 1)
    fail(
      "AMBIGUOUS_TOURNAMENT",
      "La selección del torneo por slug no es única.",
    );
  const tournament = rows.tournaments[0],
    tournamentId = uuid(tournament.id, "tournaments.id");
  if (tournament.slug !== TOURNAMENT_SLUG)
    fail(
      "WRONG_TOURNAMENT",
      "El torneo obtenido no coincide con el slug autorizado.",
    );
  const metadata: CalendarMetadata = {
    source: "supabase",
    tournament: {
      id: tournamentId,
      slug: TOURNAMENT_SLUG,
      name: text(tournament.name, "tournaments.name"),
      season: tournament.season,
      location: tournament.location,
    },
    groups: [],
    teams: [],
    matchdays: [],
    matches: [],
    notices: [],
  };
  if (rows.groups.length !== 6)
    fail(
      "INCOMPLETE_GROUPS",
      "Se requieren exactamente los seis grupos oficiales visibles para el torneo.",
    );
  const groupById = new Map<string, GroupId>();
  for (const group of rows.groups) {
    inTournament(group, tournamentId, "groups");
    const id = uuid(group.id, "groups.id"),
      name = text(group.name, "groups.name"),
      local = lookup(GROUP_NAMES, name, "groups.name");
    if ([...groupById.values()].includes(local))
      fail(
        "DUPLICATE_GROUP",
        "Hay dos grupos con la misma correspondencia oficial.",
      );
    groupById.set(id, local);
    metadata.groups.push({ id, name, localGroup: local });
  }
  if (rows.teams.length !== 18)
    fail(
      "INCOMPLETE_TEAMS",
      "Se requieren exactamente los 18 equipos oficiales visibles para el torneo.",
    );
  const teamById = new Map<string, Team>(),
    seenSlugs = new Set<string>();
  for (const row of rows.teams) {
    inTournament(row, tournamentId, "teams");
    const id = uuid(row.id, "teams.id"),
      groupId = uuid(row.group_id, "teams.group_id"),
      slug = text(row.slug, "teams.slug"),
      name = text(row.name, "teams.name");
    const group = groupById.get(groupId);
    if (!group)
      fail(
        "UNKNOWN_GROUP_UUID",
        "Un equipo referencia un UUID de grupo desconocido.",
      );
    const localSlug = Object.hasOwn(TEAM_SLUG_ALIASES, slug)
      ? TEAM_SLUG_ALIASES[slug]
      : slug;
    const canonical = officialTeams.find(
      (team) =>
        team.slug === localSlug && team.name === name && team.group === group,
    );
    if (!canonical || seenSlugs.has(localSlug))
      fail(
        "OFFICIAL_TEAM_MISMATCH",
        "Nombre, slug o grupo de equipo incompatible con el catálogo oficial. No se corregirá automáticamente.",
      );
    seenSlugs.add(localSlug);
    teamById.set(id, canonical);
    metadata.teams.push({ id, slug, localSlug, name, groupId });
  }
  for (const group of groupIds)
    if (
      [...teamById.values()].filter((team) => team.group === group).length !== 3
    )
      fail(
        "INVALID_GROUP_SIZE",
        "Cada grupo debe contener exactamente tres equipos oficiales.",
      );
  const dayById = new Map<
    string,
    { phase: string; stages: readonly Stage[] }
  >();
  for (const row of rows.matchdays) {
    inTournament(row, tournamentId, "matchdays");
    const id = uuid(row.id, "matchdays.id"),
      phase = text(row.phase, "matchdays.phase");
    const stages = lookup(MATCHDAY_PHASES, phase, "matchdays.phase");
    const date = nullableText(row.scheduled_date, "matchdays.scheduled_date");
    if (
      date !== null &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)
    )
      fail(
        "INVALID_MATCHDAY_DATE",
        "La fecha de jornada debe ser una fecha de calendario válida; no se usará como hora del partido.",
      );
    dayById.set(id, { phase, stages });
    metadata.matchdays.push({
      id,
      number: number(row.number, "matchdays.number"),
      phase,
      scheduledDate: date,
    });
  }
  // The owner confirmed the complete 34-game calendar. A partial/RLS-hidden calendar is not silently accepted.
  if (rows.matches.length !== 34)
    fail(
      "INCOMPLETE_CALENDAR",
      "Se requieren los 34 partidos oficiales confirmados por el propietario; revise filtros y permisos de lectura.",
    );
  const numbers = new Set<number>(),
    fixtures: Fixture[] = [];
  for (const row of rows.matches) {
    inTournament(row, tournamentId, "matches");
    const id = uuid(row.id, "matches.id"),
      matchNumber = number(row.match_number, "matches.match_number");
    if (numbers.has(matchNumber) || matchNumber > 34)
      fail(
        "INVALID_MATCH_NUMBER",
        "Números oficiales duplicados o fuera del calendario de 1 a 34.",
      );
    numbers.add(matchNumber);
    const phase = text(row.phase, "matches.phase"),
      stage = lookup(MATCH_PHASES, phase, "matches.phase"),
      status = text(row.status, "matches.status");
    if (!(STATUSES as readonly string[]).includes(status))
      fail(
        "UNKNOWN_STATUS",
        "Estado de partido desconocido; no se asumirá scheduled.",
      );
    const matchdayId = nullableUuid(row.matchday_id, "matches.matchday_id");
    if (matchdayId && !dayById.has(matchdayId))
      fail(
        "UNKNOWN_MATCHDAY_UUID",
        "Un partido referencia una jornada desconocida.",
      );
    if (matchdayId && !dayById.get(matchdayId)!.stages.includes(stage))
      fail(
        "MATCHDAY_PHASE_MISMATCH",
        "La fase del partido no corresponde a su jornada.",
      );
    if (!matchdayId)
      metadata.notices.push({
        code: "MATCHDAY_MISSING",
        matchId: id,
        message: "Partido sin jornada asignada; no se deducirá por fecha.",
      });
    const groupId = nullableUuid(row.group_id, "matches.group_id");
    if (groupId && !groupById.has(groupId))
      fail("UNKNOWN_GROUP_UUID", "Un partido referencia un grupo desconocido.");
    const homeTeamId = nullableUuid(row.home_team_id, "matches.home_team_id"),
      awayTeamId = nullableUuid(row.away_team_id, "matches.away_team_id");
    if (
      (homeTeamId && !teamById.has(homeTeamId)) ||
      (awayTeamId && !teamById.has(awayTeamId))
    )
      fail(
        "UNKNOWN_TEAM_UUID",
        "Un partido referencia un UUID de equipo desconocido.",
      );
    const homeSource = nullableText(row.home_source, "matches.home_source"),
      awaySource = nullableText(row.away_source, "matches.away_source"),
      bracketCode = nullableText(row.bracket_code, "matches.bracket_code");
    const at = scheduledAt(row.scheduled_at),
      venue = nullableText(row.venue, "matches.venue");
    let localId = id;
    if (stage === "groups") {
      if (
        matchNumber > 18 ||
        bracketCode !== null ||
        homeSource !== null ||
        awaySource !== null ||
        !groupId ||
        !homeTeamId ||
        !awayTeamId
      )
        fail(
          "INVALID_GROUP_FIXTURE",
          "Un partido de grupos requiere número 1–18, grupo y ambos equipos, sin llave ni referencias de eliminación.",
        );
    } else {
      const mapping = KNOCKOUT_MATCHES[matchNumber];
      if (!mapping || mapping.stage !== stage || mapping.code !== bracketCode)
        fail(
          "BRACKET_MAPPING_MISMATCH",
          "Fase, número y bracket_code no corresponden a una de las llaves oficiales explícitas.",
        );
      localId = mapping.localId;
      const definition = bracketDefinitions.find(
        (match) => match.id === localId,
      )!;
      for (const [source, expected] of [
        [homeSource, definition.home],
        [awaySource, definition.away],
      ] as const) {
        if (source === null || source === "WIN" || source === "LOSE") {
          if (source === "WIN" && !expected.startsWith("W:"))
            fail(
              "SOURCE_MISMATCH",
              "Referencia genérica WIN incompatible con la llave oficial.",
            );
          if (source === "LOSE" && !expected.startsWith("L:"))
            fail(
              "SOURCE_MISMATCH",
              "Referencia genérica LOSE incompatible con la llave oficial.",
            );
          metadata.notices.push({
            code: source === null ? "SOURCE_MISSING" : "SOURCE_GENERIC",
            matchId: id,
            message:
              "Referencia original conservada en metadatos; no identifica por sí sola un participante. El motor conserva su llave oficial pendiente.",
          });
        } else if (
          lookup(SOURCE_REFERENCES, source, "home_source/away_source") !==
          expected
        )
          fail(
            "SOURCE_MISMATCH",
            "La referencia almacenada contradice la llave oficial del motor; se requiere revisión, no una reasignación automática.",
          );
      }
    }
    fixtures.push({
      id: localId,
      stage,
      ...(groupId ? { group: groupById.get(groupId)! } : {}),
      ...(stage === "groups" && homeTeamId
        ? { homeTeamId: teamById.get(homeTeamId)!.slug }
        : {}),
      ...(stage === "groups" && awayTeamId
        ? { awayTeamId: teamById.get(awayTeamId)!.slug }
        : {}),
      ...(at !== null ? { startsAt: new Date(at).toISOString() } : {}),
      ...(venue !== null ? { venue } : {}),
    });
    metadata.matches.push({
      id,
      localId,
      matchNumber,
      phase,
      localStage: stage,
      bracketCode,
      matchdayId,
      groupId,
      homeTeamId,
      awayTeamId,
      homeSource,
      awaySource,
      status: status as CalendarMetadata["matches"][number]["status"],
      scheduledAt: at,
      venue,
    });
  }
  metadata.matches.sort((a, b) => a.matchNumber - b.matchNumber);
  const ordered = metadata.matches.map((match) =>
    fixtures.find((f) => f.id === match.localId)!,
  );
  const data: TournamentData = {
    teams: officialTeams.map((team) => ({ ...team })),
    fixtures: ordered,
    results: [],
    players: [],
    events: [],
    disciplineCoverage: [],
    eventCoverage: [],
    draws: [],
  };
  const results: import("../domain/types.ts").MatchResult[] = [];
  // Group results first, then official bracket order; no guessed knockout participants.
  for (const meta of [
    ...metadata.matches.filter((m) => m.localStage === "groups"),
    ...metadata.matches.filter((m) => m.localStage !== "groups"),
  ]) {
    const raw = rows.matches.find((r) => r.id === meta.id)!;
    let fixture = ordered.find((f) => f.id === meta.localId)!;
    if (meta.localStage !== "groups") {
      const bracket = options?.deferKnockoutVerification ? undefined : calculateTournament({ ...data, results }).bracket.find(
        (b) => b.id === meta.localId,
      )!;
      const home = meta.homeTeamId
        ? teamById.get(meta.homeTeamId)!.slug
        : undefined;
      const away = meta.awayTeamId
        ? teamById.get(meta.awayTeamId)!.slug
        : undefined;
      if (
        bracket && (home || away) &&
        (bracket.state !== "confirmed" ||
          home !== bracket.home.teamId ||
          away !== bracket.away.teamId)
      ) {
        if (meta.status === "finished" || meta.status === "live")
          fail(
            "KNOCKOUT_TEAMS_UNVERIFIED",
            "Los equipos del resultado no corresponden a participantes confirmados por las llaves oficiales.",
          );
        metadata.notices.push({
          code: "KNOCKOUT_TEAMS_UNVERIFIED",
          matchId: meta.id,
          message:
            "Equipos almacenados sin confirmación de la llave; no se publican como clasificados.",
        });
      }
      fixture = { ...fixture, homeTeamId: home, awayTeamId: away };
    }
    if (meta.status !== "live" && meta.status !== "finished") continue;
    if (
      meta.status === "live" &&
      raw.home_score === null &&
      raw.away_score === null
    )
      continue;
    const result = fromSupabaseScoreColumns(
      fixture,
      raw as unknown as SupabaseScoreColumns,
      meta.status,
    );
    if (result) results.push(result);
  }
  data.results = results;
  // Use the existing validator unchanged, never alternative classification formulas.
  validateTournamentData(data);
  if(!options?.deferKnockoutVerification)calculateTournament(data);
  // Deferred callers MUST enrich cards/draws and run the same engine before publishing.
  return { data, metadata };
}
export async function readSupabaseCalendar(
  reader: TournamentReader,
  options?: { deferKnockoutVerification?: boolean },
): Promise<CalendarReadSnapshot> {
  const tournaments = await reader.read("tournaments", {
    column: "slug",
    value: TOURNAMENT_SLUG,
  });
  if (!tournaments.length)
    fail(
      "TOURNAMENT_NOT_FOUND",
      `No existe o no es visible el torneo ${TOURNAMENT_SLUG}. No se seleccionará otro torneo.`,
    );
  if (tournaments.length !== 1 || tournaments[0].slug !== TOURNAMENT_SLUG)
    fail(
      "AMBIGUOUS_TOURNAMENT",
      "La selección por slug es inválida o no es única.",
    );
  const tournamentId = uuid(tournaments[0].id, "tournaments.id"),
    filter = { column: "tournament_id" as const, value: tournamentId };
  const [groups, teams, matchdays, matches] = await Promise.all([
    reader.read("groups", filter),
    reader.read("teams", filter),
    reader.read("matchdays", filter),
    reader.read("matches", filter),
  ]);
  return mapSupabaseCalendar({
    tournaments,
    groups,
    teams,
    matchdays,
    matches,
  },options);
}
