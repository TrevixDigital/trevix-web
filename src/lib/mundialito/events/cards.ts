import { isUuid, RosterError } from "../players/model.ts";
import { validateEventValues, type OfficialEvent } from "./model.ts";

export interface CardEvent extends OfficialEvent {
  dismissal_cause: "direct" | "second_yellow" | null;
}
export interface CardState {
  basis: string;
  events: CardEvent[];
}
/** A nonempty, internally coherent recorded set can inform provisional ordering.
 * Absence is unknown, never an inferred zero; unfinished/unequal snapshots are
 * filtered by the reader. No certification is granted here.
 */
export function recordedCardsSufficient(events: readonly CardEvent[]) {
  if (!events.length) return false;
  const players = new Set(events.map(e=>e.player_id));
  for(const player of players) {
    const list=events.filter(e=>e.player_id===player);
    const yellows=list.filter(e=>e.event_type==="yellow_card").length;
    const reds=list.filter(e=>e.event_type==="red_card");
    if(!player || yellows>2 || reds.length>1) return false;
    if(reds.length && !reds[0].dismissal_cause) return false;
    if(yellows===2 ? reds[0]?.dismissal_cause!=="second_yellow" : reds.some(e=>e.dismissal_cause!=="direct")) return false;
  }
  return true;
}
/** Describe missing information without manufacturing an empty official record. */
export function recordedCardRegistration(events:readonly CardEvent[]) {
  return !events.length?"zero_unconfirmed" as const:
    recordedCardsSufficient(events)?"recorded" as const:"inconsistent" as const;
}
export function cardOutcome(yellows: number, directReds: number) {
  if (
    !Number.isInteger(yellows) ||
    !Number.isInteger(directReds) ||
    yellows < 0 ||
    yellows > 2 ||
    directReds < 0 ||
    directReds > 1 ||
    (yellows === 2 && directReds === 1)
  )
    throw new RosterError(
      "REVIEW",
      "Dos amarillas y una roja directa requieren revisión; no se guardan como un registro normal.",
    );
  const cause =
    yellows === 2
      ? ("second_yellow" as const)
      : directReds === 1
        ? ("direct" as const)
        : null;
  return {
    points: yellows === 2 ? 3 : yellows + 4 * directReds,
    cause,
    expulsions: cause ? 1 : 0,
    suspensionMatches: cause === "second_yellow" ? 1 : null,
    label:
      cause === "second_yellow"
        ? "Expulsión por doble amarilla"
        : cause === "direct"
          ? "Expulsión por roja directa"
          : yellows
            ? "Una amarilla, sin expulsión"
            : "Sin tarjetas",
  };
}
export function parseCardState(raw: unknown): CardState {
  const s = raw as CardState;
  if (
    !s ||
    typeof s.basis !== "string" ||
    !/^[a-f0-9]{64}$/.test(s.basis) ||
    !Array.isArray(s.events)
  )
    throw new RosterError("DATA", "Respuesta de tarjetas inválida.");
  const events = s.events.map((e) => {
    const values = validateEventValues(e as unknown as Record<string, unknown>);
    if (
      !isUuid(e.id) ||
      !isUuid(e.match_id) ||
      !isUuid(e.tournament_id) ||
      !e.player_id ||
      !["yellow_card", "red_card"].includes(e.event_type) ||
      !Number.isFinite(Date.parse(e.created_at)) ||
      !Number.isFinite(Date.parse(e.updated_at)) ||
      ![null, "direct", "second_yellow"].includes(e.dismissal_cause) ||
      (e.event_type === "yellow_card" && e.dismissal_cause !== null)
    )
      throw new RosterError("DATA", "Evento de tarjeta inválido.");
    return { ...e, ...values };
  });
  if (new Set(events.map((e) => e.id)).size !== events.length)
    throw new RosterError("DATA", "Identificadores de tarjetas repetidos.");
  return { basis: s.basis, events };
}
export function cardDefaults(state: CardState) {
  const yellows = state.events.filter((e) => e.event_type === "yellow_card"),
    red = state.events.filter((e) => e.event_type === "red_card");
  const reviewRequired =
    yellows.length > 2 ||
    red.length > 1 ||
    (yellows.length === 2 && red[0]?.dismissal_cause === "direct");
  return {
    yellows,
    red: red[0],
    directReds:
      red[0]?.dismissal_cause === null
        ? ""
        : red[0]?.dismissal_cause === "direct"
          ? "1"
          : "0",
    reviewRequired,
  };
}
export function cardMinute(value: unknown) {
  if (value === "" || value === null) return null;
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : NaN;
  if (!Number.isInteger(n) || n < 0 || n > 130)
    throw new RosterError(
      "VALIDATION",
      "Cada minuto debe ser un entero entre 0 y 130 o quedar vacío.",
    );
  return n;
}
export function cardValues(raw: Record<string, unknown>, state: CardState) {
  const count = (v: unknown) =>
    typeof v === "string" && /^\d+$/.test(v)
      ? Number(v)
      : typeof v === "number"
        ? v
        : NaN;
  const yellows = count(raw.yellows),
    directReds = count(raw.direct_reds),
    outcome = cardOutcome(yellows, directReds);
  if (cardDefaults(state).reviewRequired)
    throw new RosterError(
      "REVIEW",
      "El historial existente requiere revisión fuera del formulario normal.",
    );
  const selected: (string | null)[] = [];
  const yellowCards = Array.from({ length: yellows }, (_, i) => {
    const id = raw[`yellow_id_${i}`] === "" ? null : raw[`yellow_id_${i}`];
    if (
      id !== null &&
      (!isUuid(id) ||
        !state.events.some(
          (e) => e.id === id && e.event_type === "yellow_card",
        ))
    )
      throw new RosterError(
        "SCOPE",
        "Selecciona la amarilla existente que deseas conservar.",
      );
    if (id && selected.includes(id))
      throw new RosterError(
        "VALIDATION",
        "No puedes seleccionar dos veces la misma amarilla.",
      );
    selected.push(id as string | null);
    return {
      id: id as string | null,
      minute: cardMinute(raw[`yellow_minute_${i}`]),
    };
  });
  if (
    selected.filter(Boolean).length !==
    Math.min(
      state.events.filter((e) => e.event_type === "yellow_card").length,
      yellows,
    )
  )
    throw new RosterError(
      "VALIDATION",
      "Conserva las amarillas existentes; crea una nueva solo cuando aumentes la cantidad.",
    );
  // No fabricar minutos ni reutilizar el de una tarjeta que se eliminó.
  const clearRedMinute =
    raw.clear_red_minute === "on" || raw.clear_red_minute === true;
  const submittedRedMinute = outcome.cause ? cardMinute(raw.red_minute) : null;
  if (outcome.cause && clearRedMinute && submittedRedMinute !== null)
    throw new RosterError(
      "VALIDATION",
      "Para borrar el minuto de expulsión, deja el campo vacío y confirma su borrado.",
    );
  const oldRed = state.events.find((e) => e.event_type === "red_card");
  const redMinute =
    !outcome.cause || clearRedMinute
      ? null
      : (submittedRedMinute ?? oldRed?.minute ?? null);
  if (
    redMinute !== null &&
    directReds === 1 &&
    yellowCards[0]?.minute !== null &&
    yellowCards[0]?.minute !== undefined &&
    redMinute < yellowCards[0].minute
  )
    throw new RosterError(
      "REVIEW",
      "La roja directa no puede preceder a la amarilla en este registro normal; revisa los minutos.",
    );
  if (
    redMinute !== null &&
    yellows === 2 &&
    yellowCards.every((c) => c.minute !== null) &&
    redMinute !== Math.max(...yellowCards.map((c) => c.minute!))
  )
    throw new RosterError(
      "REVIEW",
      "La expulsión por doble amarilla debe coincidir con la segunda amarilla cuando se conocen todos los minutos.",
    );
  return {
    yellows,
    directReds,
    yellowCards,
    redMinute,
    clearRedMinute: !!outcome.cause && clearRedMinute,
    outcome,
  };
}
