import type { SupabaseClient } from "@supabase/supabase-js";
import { checkAdminAccess } from "../admin/access.ts";
import { isUuid, RosterError } from "../players/model.ts";
import { phase4Capabilities, requirePhase4Write } from "./capabilities.ts";
import { validateEventValues, type EventValues } from "./model.ts";

export const REVIEW_COLUMNS = "match_id,tournament_id,goals_complete,cards_complete,goals_reference,cards_reference,goals_confirmed_at,cards_confirmed_at,administrative_decision_id,updated_at";
export interface MatchReview {
  match_id: string; tournament_id: string;
  goals_complete: boolean; cards_complete: boolean;
  goals_reference: string | null; cards_reference: string | null;
  goals_confirmed_at: string | null; cards_confirmed_at: string | null;
  administrative_decision_id: string | null; updated_at: string;
}
export interface ReviewScope { matchId: string; tournamentId: string }
export interface CertificationSnapshot {
  basis: string;
  match: { id: string; tournament_id: string; status: string; home_team_id: string | null; away_team_id: string | null;
    home_score: number | null; away_score: number | null; home_penalties: number | null; away_penalties: number | null; updated_at: string };
  review: MatchReview | null;
  events: (EventValues & { id: string; match_id: string; tournament_id: string; updated_at: string; dismissal_cause: "direct" | "second_yellow" | null })[];
}
export function parseCertificationSnapshot(value: unknown, scope: ReviewScope): CertificationSnapshot {
  const s = value as CertificationSnapshot | null;
  if (!s || typeof s.basis !== "string" || !/^[0-9a-f]{64}$/.test(s.basis) || !s.match ||
    s.match.id !== scope.matchId || s.match.tournament_id !== scope.tournamentId || !Array.isArray(s.events) ||
    !["scheduled","live","finished","postponed","cancelled","suspended"].includes(s.match.status) ||
    !Number.isFinite(Date.parse(s.match.updated_at))) throw new RosterError("SNAPSHOT", "Fotografía del partido inválida o ajena al torneo.");
  for (const key of ["home_score", "away_score", "home_penalties", "away_penalties"] as const)
    if (s.match[key] !== null && (!Number.isSafeInteger(s.match[key]) || s.match[key]! < 0)) throw new RosterError("SNAPSHOT", "Marcador inválido en la fotografía.");
  for (const key of ["home_team_id", "away_team_id"] as const)
    if (s.match[key] !== null && !isUuid(s.match[key])) throw new RosterError("SNAPSHOT", "Participantes inválidos.");
  const events = s.events.map(e => {
    const values = validateEventValues(e as unknown as Record<string, unknown>);
    if (!isUuid(e.id) || e.match_id !== scope.matchId || e.tournament_id !== scope.tournamentId ||
      ![s.match.home_team_id,s.match.away_team_id].includes(e.team_id) || !Number.isFinite(Date.parse(e.updated_at)) ||
      ![null,"direct","second_yellow"].includes(e.dismissal_cause)) throw new RosterError("SNAPSHOT", "Evento ajeno o inválido en la fotografía.");
    return { ...values, id: e.id, match_id: e.match_id, tournament_id: e.tournament_id, updated_at: e.updated_at, dismissal_cause: e.dismissal_cause };
  });
  if (new Set(events.map(e=>e.id)).size !== events.length) throw new RosterError("SNAPSHOT", "Fotografía con eventos duplicados.");
  return { basis: s.basis, match: s.match, events, review: s.review === null ? null : parseReview(s.review, scope) };
}
export async function loadCertificationSnapshot(client: SupabaseClient, scope: ReviewScope) {
  await authorize(client, scope);
  const capabilities = phase4Capabilities();
  if (!capabilities.read || !capabilities.isolated) throw new RosterError("CAPABILITY", "La fotografía de certificación v2 solo se prueba en el entorno aislado.");
  const result = await client.rpc("mundialito_get_acta_snapshot", { p_match_id: scope.matchId });
  if (result.error) throw new RosterError(result.error.code ?? "SNAPSHOT", "La protección de concurrencia v2 no está disponible en este entorno. No se utilizará la certificación antigua.");
  return parseCertificationSnapshot(result.data, scope);
}
async function authorize(client: SupabaseClient, scope: ReviewScope) {
  const access = await checkAdminAccess({
    async getVerifiedUser() { const r = await client.auth.getUser(); return { user: r.data.user, error: r.error }; },
    async isAdmin() { return client.rpc("is_mundialito_admin", undefined, { get: true }); },
  });
  if (access !== "allowed") throw new RosterError("ACCESS", "Se requiere sesión administrativa válida para consultar o certificar el acta.");
  if (!isUuid(scope.matchId) || !isUuid(scope.tournamentId)) throw new RosterError("SCOPE", "Identidad del acta inválida.");
  const tournament = await client.from("tournaments").select("id").eq("slug", "mundialito-la-bomba-2026").single();
  if (tournament.error || tournament.data?.id !== scope.tournamentId)
    throw new RosterError("SCOPE", "El acta no pertenece al torneo oficial seleccionado.");
}
export function parseReview(value: unknown, scope: ReviewScope): MatchReview {
  const r = value as MatchReview | null;
  if (!r || r.match_id !== scope.matchId || r.tournament_id !== scope.tournamentId ||
    typeof r.goals_complete !== "boolean" || typeof r.cards_complete !== "boolean" ||
    typeof r.updated_at !== "string" || !Number.isFinite(Date.parse(r.updated_at)))
    throw new RosterError("REVIEW_DATA", "Acta fuera del torneo solicitado o con versión inválida.");
  for (const field of ["goals_reference", "cards_reference", "goals_confirmed_at", "cards_confirmed_at", "administrative_decision_id"] as const)
    if (r[field] !== null && typeof r[field] !== "string") throw new RosterError("REVIEW_DATA", "El acta contiene campos inválidos.");
  for (const kind of ["goals", "cards"] as const)
    if (r[`${kind}_complete`] && (!r[`${kind}_reference`]?.trim() || !r[`${kind}_confirmed_at`] || !Number.isFinite(Date.parse(r[`${kind}_confirmed_at`]!))))
      throw new RosterError("REVIEW_DATA", "Certificación incompleta; solicita revisión.");
  if (r.administrative_decision_id !== null && !isUuid(r.administrative_decision_id)) throw new RosterError("REVIEW_DATA", "Resolución administrativa inválida.");
  return r;
}
export async function readMatchReview(client: SupabaseClient, scope: ReviewScope) {
  await authorize(client, scope);
  const readEnabled = phase4Capabilities().read;
  const result = await client.from(readEnabled ? "match_event_reviews" : "mundialito_public_reviews").select(readEnabled ? REVIEW_COLUMNS : "match_id,tournament_id")
    .eq("tournament_id", scope.tournamentId).eq("match_id", scope.matchId).maybeSingle();
  if (result.error) {
    if (["42P01", "PGRST205", "PGRST204"].includes(result.error.code)) return { available: false as const, review: null, readEnabled };
    throw new RosterError(result.error.code ?? "REVIEW_READ", "No se pudo consultar el acta. Comprueba sesión, permisos y conexión; no se asumirá una certificación.");
  }
  return { available: true as const, review: result.data && readEnabled ? parseReview(result.data, scope) : null, readEnabled };
}
export async function certifyMatchReview(client: SupabaseClient, scope: ReviewScope,
  version: string | null, raw: Record<string, unknown>, confirmed: boolean) {
  await authorize(client, scope);
  requirePhase4Write("certification");
  if (typeof raw.basis !== "string" || !/^[0-9a-f]{64}$/.test(raw.basis)) throw new RosterError("SNAPSHOT", "Carga y revisa la fotografía completa antes de certificar.");
  if (version !== null && (typeof version !== "string" || !Number.isFinite(Date.parse(version)))) throw new RosterError("VERSION", "Recarga el acta para obtener su versión.");
  if (!confirmed || typeof raw.goals !== "boolean" || typeof raw.cards !== "boolean") throw new RosterError("VALIDATION", "Confirma los estados de revisión del acta.");
  const reference = (key: string, complete: boolean) => {
    const text = typeof raw[key] === "string" ? raw[key].trim() : "";
    if (text.length > 1000 || (complete && !text)) throw new RosterError("VALIDATION", "Indica una referencia del acta de hasta 1000 caracteres para cada revisión completa.");
    return text || null;
  };
  // Keep an existing administrative resolution, never accept one supplied by a form.
  const current = await readMatchReview(client, scope);
  if (!current.available) throw new RosterError("SCHEMA", "El esquema de actas no está disponible.");
  if ((current.review?.updated_at ?? null) !== version) throw new RosterError("CONFLICT", "El acta cambió o fue invalidada. Recarga antes de certificar.");
  const result = await client.rpc("mundialito_certify_match_events_v2", {
    p_match_id: scope.matchId, p_expected_basis: raw.basis, p_expected_updated_at: version,
    p_goals_complete: raw.goals, p_cards_complete: raw.cards,
    p_goals_reference: reference("goalsReference", raw.goals),
    p_cards_reference: reference("cardsReference", raw.cards),
    p_administrative_decision_id: current.review?.administrative_decision_id ?? null,
  });
  if (result.error) {
    const message = result.error.message ?? "";
    const explanation = result.error.code === "40001" ? "El acta cambió durante la operación. Recarga antes de certificar." :
      result.error.code === "42501" ? "La sesión no tiene autorización administrativa válida." :
      ["PGRST202", "42883"].includes(result.error.code) ? "La RPC de certificación no está disponible en este entorno." :
      message.includes("Goles y marcador difieren") ? "Los goles registrados no coinciden con el marcador. Revisa goles y autogoles; una excepción requiere resolución oficial." :
      message.includes("Causa de expulsion pendiente") ? "Hay una expulsión sin causa confirmada. Revisa las tarjetas antes de certificar." :
      "Puede existir una corrección concurrente, una discrepancia con el marcador o un asunto del Comité. Recarga antes de reintentar.";
    throw new RosterError(result.error.code ?? "REVIEW_SAVE", `No se confirmó la certificación (${result.error.code ?? "error"}). ${explanation}`);
  }
  const review = parseReview(Array.isArray(result.data) && result.data.length === 1 ? result.data[0] : result.data, scope);
  if (review.goals_complete !== raw.goals || review.cards_complete !== raw.cards) throw new RosterError("CONFIRMATION", "La certificación devuelta no coincide. Recarga; no se repetirá automáticamente.");
  return review;
}
