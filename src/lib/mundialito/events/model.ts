import { isUuid, RosterError } from "../players/model.ts";
export const eventLabels = {
  goal: "Gol",
  own_goal: "Autogol",
  yellow_card: "Tarjeta amarilla",
  red_card: "Tarjeta roja · causa por certificar",
};
export type EventType = keyof typeof eventLabels;
export interface EventValues {
  team_id: string;
  player_id: string | null;
  event_type: EventType;
  minute: number | null;
  notes: string | null;
}
export interface OfficialEvent extends EventValues {
  id: string;
  tournament_id: string;
  match_id: string;
  updated_at: string;
  created_at: string;
}
export const EVENT_COLUMNS =
  "id,tournament_id,match_id,team_id,player_id,event_type,minute,notes,created_at,updated_at";
export function validateEventValues(raw: Record<string, unknown>): EventValues {
  if (
    !isUuid(raw.team_id) ||
    typeof raw.event_type !== "string" ||
    !Object.hasOwn(eventLabels, raw.event_type)
  )
    throw new RosterError("VALIDATION", "Equipo o tipo de evento no válido.");
  const player_id =
    raw.player_id === "" || raw.player_id === null ? null : raw.player_id;
  if (
    (player_id !== null && !isUuid(player_id)) ||
    (player_id === null && raw.event_type !== "own_goal")
  )
    throw new RosterError(
      "VALIDATION",
      "Selecciona un jugador de la nómina; solo un autogol admite autor desconocido.",
    );
  const minute =
    raw.minute === null || raw.minute === ""
      ? null
      : typeof raw.minute === "number"
        ? raw.minute
        : typeof raw.minute === "string" && /^\d+$/.test(raw.minute)
          ? Number(raw.minute)
          : NaN;
  if (
    minute !== null &&
    (!Number.isInteger(minute) || minute < 0 || minute > 130)
  )
    throw new RosterError(
      "VALIDATION",
      "El minuto debe quedar vacío o ser un entero entre 0 y 130.",
    );
  if (raw.notes !== null && typeof raw.notes !== "string")
    throw new RosterError("VALIDATION", "Observaciones no válidas.");
  const notes = typeof raw.notes === "string" ? raw.notes.trim() || null : null;
  if (notes?.includes("\0"))
    throw new RosterError("VALIDATION", "Observaciones no válidas.");
  return {
    team_id: raw.team_id,
    player_id: player_id as string | null,
    event_type: raw.event_type as EventType,
    minute,
    notes,
  };
}
