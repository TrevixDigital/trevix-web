import { playerSlug } from "../data/players.ts";
import type { GroupId } from "../data/teams.ts";
export const positions = {
  goalkeeper: "Portero",
  defender: "Defensa",
  midfielder: "Mediocampista",
  forward: "Delantero",
} as const;
export type Position = keyof typeof positions;
export interface RosterTeam {
  id: string;
  slug: string;
  name: string;
  group: GroupId;
}
export interface RosterContext {
  tournamentId: string;
  teams: RosterTeam[];
}
export interface RosterPlayer {
  id: string;
  tournamentId: string;
  teamId: string;
  fullName: string;
  slug: string;
  shirtNumber: number | null;
  position: Position | null;
  active: boolean;
  updatedAt: string;
}
export interface PlayerValues {
  fullName: string;
  shirtNumber: number | null;
  position: Position | null;
  active: boolean;
}
export class RosterError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "RosterError";
  }
}
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function validatePlayerValues(input: {
  fullName: unknown;
  shirtNumber: unknown;
  position: unknown;
  active: unknown;
}): PlayerValues {
  if (typeof input.fullName !== "string")
    throw new RosterError("VALIDATION", "Introduce el nombre completo.");
  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  if ([...fullName].length < 2 || fullName.includes("\0"))
    throw new RosterError(
      "VALIDATION",
      "El nombre debe tener al menos dos caracteres válidos.",
    );
  const raw = input.shirtNumber;
  const shirtNumber =
    raw === "" || raw === null
      ? null
      : typeof raw === "number"
        ? raw
        : typeof raw === "string" && /^\d{1,2}$/.test(raw)
          ? Number(raw)
          : NaN;
  if (
    shirtNumber !== null &&
    (!Number.isInteger(shirtNumber) || shirtNumber < 1 || shirtNumber > 99)
  )
    throw new RosterError(
      "VALIDATION",
      "El dorsal debe quedar vacío o ser un entero entre 1 y 99.",
    );
  const position =
    input.position === "" || input.position === null ? null : input.position;
  if (
    position !== null &&
    (typeof position !== "string" || !Object.hasOwn(positions, position))
  )
    throw new RosterError(
      "VALIDATION",
      "Selecciona una posición admitida o deja el campo vacío.",
    );
  if (typeof input.active !== "boolean")
    throw new RosterError("VALIDATION", "El estado activo no es válido.");
  return {
    fullName,
    shirtNumber,
    position: position as Position | null,
    active: input.active,
  };
}
export function makePlayerSlug(name: string, id: string) {
  return (
    (playerSlug(name, id).split("--")[0].slice(0, 80).replace(/-$/, "") ||
      "jugador") + `--${id}`
  );
}
export function publicPlayerSlug(player: Pick<RosterPlayer, "slug" | "id">) {
  return /^[a-z0-9-]+$/.test(player.slug) &&
    player.slug.endsWith(`--${player.id}`) &&
    player.slug.length <= 160
    ? player.slug
    : makePlayerSlug(player.slug || "jugador", player.id);
}
export function playerIdFromSlug(slug: string) {
  const suffix = slug.slice(-36);
  return slug.endsWith(`--${suffix}`) && isUuid(suffix) ? suffix : null;
}
export const normalizePlayerName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es");
export function duplicateWarnings(
  values: PlayerValues,
  players: readonly RosterPlayer[],
  exceptId?: string,
) {
  const others = players.filter((p) => p.id !== exceptId);
  const warnings: string[] = [];
  if (
    others.some(
      (p) =>
        normalizePlayerName(p.fullName) ===
        normalizePlayerName(values.fullName),
    )
  )
    warnings.push(
      "Ya hay un nombre similar en esta nómina. Comprueba que sean personas distintas.",
    );
  if (
    values.shirtNumber !== null &&
    others.some((p) => p.shirtNumber === values.shirtNumber)
  )
    warnings.push(
      "El dorsal coincide con otro jugador. No existe una regla oficial que impida guardarlo.",
    );
  return warnings;
}
export function decodePlayer(
  row: Record<string, unknown>,
  context: RosterContext,
  teamId?: string,
): RosterPlayer {
  if (
    !isUuid(row.id) ||
    row.tournament_id !== context.tournamentId ||
    !isUuid(row.team_id) ||
    !context.teams.some((t) => t.id === row.team_id) ||
    (teamId && row.team_id !== teamId) ||
    typeof row.slug !== "string" ||
    !row.slug ||
    typeof row.updated_at !== "string" ||
    !Number.isFinite(Date.parse(row.updated_at))
  )
    throw new RosterError(
      "DATA",
      "La nómina contiene una identidad o relación inválida.",
    );
  const v = validatePlayerValues({
    fullName: row.full_name,
    shirtNumber: row.shirt_number,
    position: row.position,
    active: row.is_active,
  });
  return {
    id: row.id,
    tournamentId: context.tournamentId,
    teamId: row.team_id,
    slug: row.slug,
    updatedAt: row.updated_at,
    ...v,
  };
}
