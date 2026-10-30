import type { SupabaseClient } from "@supabase/supabase-js";
import { teams as officialTeams } from "../data/teams.ts";
import {
  GROUP_NAMES,
  TEAM_SLUG_ALIASES,
  TOURNAMENT_SLUG,
} from "../supabase/calendar-mapping.ts";
import { checkAdminAccess } from "../admin/access.ts";
import {
  decodePlayer,
  duplicateWarnings,
  isUuid,
  makePlayerSlug,
  playerIdFromSlug,
  RosterError,
  validatePlayerValues,
  type PlayerValues,
  type RosterContext,
  type RosterPlayer,
} from "./model.ts";
export const PLAYER_COLUMNS =
  "id,tournament_id,team_id,full_name,slug,shirt_number,position,is_active,created_at,updated_at";
function failDB(error: { code?: string } | null) {
  if (!error) return;
  const message =
    error.code === "42501"
      ? "Supabase no permite esta operación. Revisa la sesión y las políticas RLS."
      : error.code === "23505"
        ? "Existe un conflicto de identificador o slug. Revisa la nómina antes de volver a guardar."
        : error.code === "23503"
          ? "El equipo o torneo no está disponible para este fichaje."
          : error.code === "23514"
            ? "Los datos no cumplen las restricciones de la base de datos."
            : "No se pudo confirmar la operación con Supabase. Comprueba la nómina antes de reintentar.";
  throw new RosterError(error.code ?? "DATABASE", message);
}
export async function readRosterContext(
  client: SupabaseClient,
): Promise<RosterContext> {
  const tournament = await client
    .from("tournaments")
    .select("id,slug")
    .eq("slug", TOURNAMENT_SLUG)
    .maybeSingle();
  failDB(tournament.error);
  if (
    !tournament.data ||
    !isUuid(tournament.data.id) ||
    tournament.data.slug !== TOURNAMENT_SLUG
  )
    throw new RosterError("TOURNAMENT", "No se encontró el torneo oficial.");
  const tournamentId = tournament.data.id;
  const [groups, teams] = await Promise.all([
    client
      .from("groups")
      .select("id,name,tournament_id")
      .eq("tournament_id", tournamentId),
    client
      .from("teams")
      .select("id,name,slug,group_id,tournament_id")
      .eq("tournament_id", tournamentId),
  ]);
  failDB(groups.error);
  failDB(teams.error);
  if (groups.data?.length !== 6 || teams.data?.length !== 18)
    throw new RosterError(
      "TEAMS",
      "No se pudo leer el catálogo completo de 18 equipos.",
    );
  const groupById = new Map(
    groups.data.map((g) => [g.id, GROUP_NAMES[g.name]]),
  );
  const rosterTeams = teams.data.map((t) => ({
    id: t.id,
    slug: Object.hasOwn(TEAM_SLUG_ALIASES, t.slug)
      ? TEAM_SLUG_ALIASES[t.slug]
      : t.slug,
    name: t.name,
    group: groupById.get(t.group_id),
  }));
  if (
    groups.data.some(
      (g) =>
        g.tournament_id !== tournamentId ||
        !isUuid(g.id) ||
        !GROUP_NAMES[g.name],
    ) ||
    new Set(groupById.values()).size !== 6 ||
    rosterTeams.some(
      (t) =>
        !isUuid(t.id) ||
        !officialTeams.some(
          (o) => o.slug === t.slug && o.name === t.name && o.group === t.group,
        ),
    ) ||
    new Set(rosterTeams.map((t) => t.slug)).size !== 18 ||
    new Set(rosterTeams.map((t) => t.id)).size !== 18 ||
    teams.data.some((t) => t.tournament_id !== tournamentId)
  )
    throw new RosterError(
      "TEAMS",
      "El catálogo recibido no coincide con los equipos oficiales.",
    );
  return {
    tournamentId,
    teams: officialTeams.map((o) =>
      rosterTeams.find((t) => t.slug === o.slug)!,
    ),
  } as RosterContext;
}
export async function readPlayers(
  client: SupabaseClient,
  context: RosterContext,
  teamId?: string,
): Promise<RosterPlayer[]> {
  const all: RosterPlayer[] = [];
  let expected: number | undefined;
  for (let page = 0; page < 100; page++) {
    let query = client
      .from("players")
      .select(PLAYER_COLUMNS, { count: "exact" })
      .eq("tournament_id", context.tournamentId)
      .order("id")
      .range(all.length, all.length + 99);
    if (teamId) query = query.eq("team_id", teamId);
    const r = await query;
    failDB(r.error);
    if (
      !Array.isArray(r.data) ||
      r.count === null ||
      !Number.isSafeInteger(r.count) ||
      r.count < 0 ||
      (expected !== undefined && expected !== r.count)
    )
      throw new RosterError(
        "READ",
        "La lectura de nóminas quedó incompleta o cambió durante la consulta.",
      );
    expected = r.count;
    all.push(...r.data.map((row) => decodePlayer(row, context, teamId)));
    if (new Set(all.map((p) => p.id)).size !== all.length)
      throw new RosterError(
        "READ",
        "La lectura de nóminas contiene identificadores repetidos.",
      );
    if (all.length === expected)
      return all.sort(
        (a, b) =>
          a.fullName.localeCompare(b.fullName, "es") ||
          a.id.localeCompare(b.id),
      );
    if (!r.data.length || all.length > expected)
      throw new RosterError("READ", "No se utilizarán nóminas parciales.");
  }
  throw new RosterError(
    "READ",
    "La nómina excede el límite de lectura de esta fase.",
  );
}
export async function readPlayer(
  client: SupabaseClient,
  context: RosterContext,
  id: string,
  teamId?: string,
) {
  if (!isUuid(id)) throw new RosterError("NOT_FOUND", "Jugador no disponible.");
  let query = client
    .from("players")
    .select(PLAYER_COLUMNS)
    .eq("id", id)
    .eq("tournament_id", context.tournamentId);
  if (teamId) query = query.eq("team_id", teamId);
  const r = await query.maybeSingle();
  failDB(r.error);
  return r.data ? decodePlayer(r.data, context, teamId) : null;
}
const matchesValues = (p: RosterPlayer, v: PlayerValues) =>
  p.fullName === v.fullName &&
  p.shirtNumber === v.shirtNumber &&
  p.position === v.position &&
  p.active === v.active;
export async function readPublicPlayerRecord(
  client: SupabaseClient,
  context: RosterContext,
  slug: string,
) {
  const id = playerIdFromSlug(slug);
  if (id) return readPlayer(client, context, id);
  const r = await client
    .from("players")
    .select("id")
    .eq("tournament_id", context.tournamentId)
    .eq("slug", slug)
    .limit(2);
  failDB(r.error);
  return r.data?.length === 1
    ? readPlayer(client, context, r.data[0].id)
    : null;
}
export async function saveRosterPlayer(
  client: SupabaseClient,
  input: {
    teamSlug: string;
    id: string;
    mode: "create" | "edit";
    version?: string;
    values: PlayerValues;
  },
) {
  const permission = await checkAdminAccess({
    async getVerifiedUser() {
      const r = await client.auth.getUser();
      return { user: r.data.user, error: r.error };
    },
    async isAdmin() {
      return await client.rpc("is_mundialito_admin", undefined, { get: true });
    },
  });
  if (permission !== "allowed")
    throw new RosterError(
      "ACCESS",
      "No se autorizó el guardado. Vuelve a iniciar sesión.",
    );
  if (!isUuid(input.id) || (input.mode !== "create" && input.mode !== "edit"))
    throw new RosterError(
      "VALIDATION",
      "La solicitud de fichaje no es válida.",
    );
  const values = validatePlayerValues(input.values);
  const context = await readRosterContext(client),
    team = context.teams.find((t) => t.slug === input.teamSlug);
  if (!team) throw new RosterError("TEAM", "Selecciona un equipo oficial.");
  const existing = await readPlayer(client, context, input.id, team.id);
  const players = await readPlayers(client, context, team.id);
  const warnings = duplicateWarnings(values, players, input.id);
  if (input.mode === "create" && existing) {
    if (matchesValues(existing, values))
      return { player: existing, team, warnings, repeated: true };
    throw new RosterError(
      "REUSED",
      "Este fichaje ya fue recibido con otros datos. Abre el jugador en Editar; no se creará otro registro.",
    );
  }
  if (input.mode === "edit" && !existing)
    throw new RosterError(
      "NOT_FOUND",
      "El jugador no pertenece al equipo seleccionado o ya no está disponible.",
    );
  const body = {
    full_name: values.fullName,
    shirt_number: values.shirtNumber,
    position: values.position,
    is_active: values.active,
  };
  let r;
  if (input.mode === "create") {
    const slug = makePlayerSlug(values.fullName, input.id);
    if (players.some((p) => p.slug === slug))
      throw new RosterError("SLUG", "El slug ya está ocupado en este equipo.");
    r = await client
      .from("players")
      .insert({
        id: input.id,
        tournament_id: context.tournamentId,
        team_id: team.id,
        slug,
        ...body,
      })
      .select(PLAYER_COLUMNS)
      .single();
    if (r.error?.code === "23505") {
      const after = await readPlayer(client, context, input.id, team.id);
      if (after && matchesValues(after, values))
        return { player: after, team, warnings, repeated: true };
    }
  } else {
    if (!input.version || !Number.isFinite(Date.parse(input.version)))
      throw new RosterError(
        "VALIDATION",
        "Falta la versión de la ficha. Recarga antes de editar.",
      );
    if (existing!.updatedAt !== input.version) {
      if (matchesValues(existing!, values))
        return { player: existing!, team, warnings, repeated: true };
      throw new RosterError(
        "CONFLICT",
        "La ficha cambió desde que la abriste. Recarga y revisa los datos antes de guardar.",
      );
    }
    // Slug, UUID and both foreign keys are intentionally absent from the PATCH.
    const updated_at = new Date(
      Math.max(Date.now(), Date.parse(existing!.updatedAt) + 1),
    ).toISOString();
    r = await client
      .from("players")
      .update({ ...body, updated_at })
      .eq("id", input.id)
      .eq("team_id", team.id)
      .eq("tournament_id", context.tournamentId)
      .eq("updated_at", input.version)
      .select(PLAYER_COLUMNS)
      .maybeSingle();
    if (!r.error && !r.data) {
      const after = await readPlayer(client, context, input.id, team.id);
      if (after && matchesValues(after, values))
        return { player: after, team, warnings, repeated: true };
      throw new RosterError(
        "CONFLICT",
        "Otro guardado modificó la ficha. Recarga para no sobrescribir sus cambios.",
      );
    }
  }
  failDB(r.error);
  if (!r.data)
    throw new RosterError(
      "CONFIRMATION",
      "Supabase no confirmó el guardado. Comprueba la nómina antes de reintentar.",
    );
  const player = decodePlayer(r.data, context, team.id);
  if (
    player.id !== input.id ||
    !matchesValues(player, values) ||
    (existing && player.slug !== existing.slug)
  )
    throw new RosterError(
      "CONFIRMATION",
      "La respuesta de guardado no coincide con la ficha solicitada. Revisa la nómina.",
    );
  return { player, team, warnings, repeated: false };
}
