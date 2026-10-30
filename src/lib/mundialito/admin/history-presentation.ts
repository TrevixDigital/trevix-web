import type { AuditEntry } from "./regulatory-read.ts";

export interface HistoryNames {
  teams?: readonly { id: string; name: string }[];
  players?: readonly { id: string; fullName: string }[];
}
const fields: Record<string, string> = {
  status: "Estado", scheduled_at: "Programación", venue: "Sede",
  home_team_id: "Equipo local", away_team_id: "Equipo visitante",
  home_score: "Goles local", away_score: "Goles visitante",
  home_penalties: "Penales local", away_penalties: "Penales visitante",
  team_id: "Equipo", player_id: "Jugador", event_type: "Evento",
  minute: "Minuto", notes: "Observaciones", dismissal_cause: "Expulsión",
  goals_complete: "Goles revisados", cards_complete: "Tarjetas revisadas",
  cards_recorded_at: "Revisión operativa de tarjetas",
};
const statuses: Record<string, string> = { scheduled: "Programado", live: "En juego", finished: "Finalizado", postponed: "Aplazado", cancelled: "Cancelado", suspended: "Suspendido" };
const events: Record<string, string> = { goal: "Gol", own_goal: "Autogol", yellow_card: "Tarjeta amarilla", red_card: "Tarjeta roja" };
const causes: Record<string, string> = { direct: "Roja directa", second_yellow: "Doble amarilla" };
export function historyDate(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-GT", { timeZone: "America/Guatemala", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(value));
}
export function historyHeading(entry: Pick<AuditEntry, "entity" | "action">) {
  const entity = ({ match: "Partido", match_event: "Evento del partido", match_review: "Revisión del acta", decision: "Decisión registrada" } as Record<string, string>)[entry.entity] ?? entry.entity;
  const action = ({ INSERT: "Registro creado", UPDATE: "Registro actualizado", DELETE: "Registro eliminado" } as Record<string, string>)[entry.action] ?? entry.action;
  return `${entity} · ${action}`;
}
const empty = (value: unknown) => value === null || value === undefined || value === "";
function value(field: string, input: unknown, names: HistoryNames) {
  const text = String(input);
  if (["team_id", "home_team_id", "away_team_id"].includes(field)) return names.teams?.find(t => t.id === input)?.name ?? `ID ${text}`;
  if (field === "player_id") return names.players?.find(p => p.id === input)?.fullName ?? `ID ${text}`;
  if (field === "scheduled_at" || field === "cards_recorded_at") return historyDate(text);
  if (field === "status") return statuses[text] ?? text;
  if (field === "event_type") return events[text] ?? text;
  if (field === "dismissal_cause") return causes[text] ?? text;
  if (typeof input === "boolean") return input ? "Sí" : "No";
  return text;
}
export function historyChange(change: AuditEntry["changes"][number], names: HistoryNames = {}) {
  if (empty(change.before) && empty(change.after)) return null;
  const label = fields[change.field] ?? change.field;
  if (empty(change.before)) return `${label}: ${value(change.field, change.after, names)}`;
  if (empty(change.after)) return `${label}: retirado (antes: ${value(change.field, change.before, names)})`;
  return `${label}: ${value(change.field, change.before, names)} → ${value(change.field, change.after, names)}`;
}
/** Display an already calculated value; never infer coverage or recalculate discipline. */
export function groupDisciplineLabel(stats: { discipline: number | null; provisionalDiscipline?: number | null }) {
  const points = stats.discipline ?? stats.provisionalDiscipline;
  return points === null || points === undefined ? "Pendiente de revisión de tarjetas" : `${points} ${points === 1 ? "punto" : "puntos"}${stats.discipline === null ? " (provisional)" : ""}`;
}
