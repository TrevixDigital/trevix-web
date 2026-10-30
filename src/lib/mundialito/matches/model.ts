import { STATUSES, MATCH_PHASES } from "../supabase/calendar-mapping.ts";
import { RosterError, normalizePlayerName } from "../players/model.ts";
export function filterMatches<
  T extends {
    phase: string;
    dayId: string | null;
    status: string;
    home: string;
    away: string;
  },
>(
  matches: readonly T[],
  filter: { phase: string; day: string; status: string; search: string },
) {
  return matches.filter(
    (m) =>
      m.phase === filter.phase &&
      (!filter.day || (m.dayId ?? "unassigned") === filter.day) &&
      (!filter.status || m.status === filter.status) &&
      normalizePlayerName(`${m.home} ${m.away}`).includes(
        normalizePlayerName(filter.search),
      ),
  );
}
export const statusLabels = {
  scheduled: "Programado",
  live: "En juego",
  finished: "Finalizado",
  postponed: "Aplazado",
  cancelled: "Cancelado",
  suspended: "Suspendido",
};
export const phaseLabels = {
  groups: "Fase de grupos",
  round_of_16: "Octavos de final",
  quarterfinals: "Cuartos de final",
  semifinals: "Semifinales",
  third_place: "Tercer lugar",
  final: "Final",
};
export type MatchPhase = keyof typeof phaseLabels;
export interface MatchValues {
  scheduled_at: string | null;
  venue: string | null;
  notes: string | null;
  status: keyof typeof statusLabels;
  home_score: number | null;
  away_score: number | null;
  home_penalties: number | null;
  away_penalties: number | null;
}
export const MATCH_FIELDS = [
  "scheduled_at",
  "venue",
  "notes",
  "status",
  "home_score",
  "away_score",
  "home_penalties",
  "away_penalties",
] as const;
const nullableText = (v: unknown) => {
  if (v === null || v === "") return null;
  if (typeof v !== "string" || v.includes("\0"))
    throw new RosterError("VALIDATION", "Texto inválido.");
  return v.trim() || null;
};
const goal = (v: unknown) => {
  if (v === null || v === "") return null;
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string" && /^\d+$/.test(v)
        ? Number(v)
        : NaN;
  if (!Number.isSafeInteger(n) || n < 0 || n > 2147483647)
    throw new RosterError(
      "VALIDATION",
      "Goles y penales deben ser enteros no negativos compatibles con integer.",
    );
  return n;
};
export function validateMatchValues(
  input: Record<string, unknown>,
  phase: string,
): MatchValues {
  if (
    !Object.hasOwn(MATCH_PHASES, phase) ||
    !(STATUSES as readonly unknown[]).includes(input.status)
  )
    throw new RosterError("VALIDATION", "Fase o estado desconocido.");
  const status = input.status as MatchValues["status"];
  const home_score = goal(input.home_score),
    away_score = goal(input.away_score),
    home_penalties = goal(input.home_penalties),
    away_penalties = goal(input.away_penalties);
  if (
    (home_score === null) !== (away_score === null) ||
    (status === "finished" && home_score === null)
  )
    throw new RosterError(
      "VALIDATION",
      "Introduce ambos marcadores; un finalizado requiere marcador registrado.",
    );
  if ((home_penalties === null) !== (away_penalties === null))
    throw new RosterError(
      "VALIDATION",
      "La tanda debe tener ambos marcadores o ninguno.",
    );
  if (
    home_penalties !== null &&
    (phase === "groups" ||
      status !== "finished" ||
      home_score === null ||
      home_score !== away_score ||
      home_penalties === away_penalties)
  )
    throw new RosterError(
      "VALIDATION",
      "Penales solo en eliminación finalizada y empatada, con ganador inequívoco de tanda.",
    );
  const scheduled_at = nullableText(input.scheduled_at);
  if (
    scheduled_at &&
    (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(
      scheduled_at,
    ) ||
      !Number.isFinite(Date.parse(scheduled_at)))
  )
    throw new RosterError(
      "VALIDATION",
      "Fecha y hora requieren una zona horaria explícita.",
    );
  return {
    status,
    home_score,
    away_score,
    home_penalties,
    away_penalties,
    scheduled_at: scheduled_at ? new Date(scheduled_at).toISOString() : null,
    venue: nullableText(input.venue),
    notes: nullableText(input.notes),
  };
}
export function localMatchDate(value: string | null) {
  if (!value) return { date: "", time: "" };
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guatemala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (key: string) => parts.find((p) => p.type === key)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}
export function fromLocalMatchDate(date: unknown, time: unknown) {
  if (date === "" && time === "") return null;
  if (
    typeof date !== "string" ||
    typeof time !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^\d{2}:\d{2}$/.test(time)
  )
    throw new RosterError(
      "VALIDATION",
      "Completa fecha y hora de Guatemala o deja ambas vacías.",
    );
  const value = `${date}T${time}:00-06:00`,
    ms = Date.parse(value);
  if (!Number.isFinite(ms))
    throw new RosterError("VALIDATION", "Fecha u hora no válidas.");
  const check = localMatchDate(value);
  if (check.date !== date || check.time !== time)
    throw new RosterError("VALIDATION", "La fecha no existe en el calendario.");
  return new Date(ms).toISOString();
}
