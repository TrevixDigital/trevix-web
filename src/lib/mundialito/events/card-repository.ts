import type { SupabaseClient } from "@supabase/supabase-js";
import { checkAdminAccess } from "../admin/access.ts";
import { RosterError, isUuid } from "../players/model.ts";
import { cardValues, parseCardState, type CardState } from "./cards.ts";
import { requirePhase4Write } from "./capabilities.ts";
export interface CardBinding {
  matchId: string;
  teamId: string;
  playerId: string;
}
async function authorize(client: SupabaseClient, scope: CardBinding) {
  const access = await checkAdminAccess({
    async getVerifiedUser() {
      const r = await client.auth.getUser();
      return { user: r.data.user, error: r.error };
    },
    async isAdmin() {
      return client.rpc("is_mundialito_admin", undefined, { get: true });
    },
  });
  if (access !== "allowed")
    throw new RosterError(
      "ACCESS",
      "Se requiere sesión administrativa válida.",
    );
  if (![scope.matchId, scope.teamId, scope.playerId].every(isUuid))
    throw new RosterError(
      "SCOPE",
      "Identidad de partido, equipo o jugador inválida.",
    );
}
function rpcError(error: { code?: string } | null) {
  if (!error) return;
  if (["PGRST202", "42883"].includes(error.code ?? ""))
    throw new RosterError(
      "MIGRATION",
      "La RPC de tarjetas no está disponible en este entorno. Comprueba esquema y permisos; no se realizó una escritura alternativa.",
    );
  throw new RosterError(
    error.code ?? "DATABASE",
    `No se confirmó el guardado de tarjetas (${error.code ?? "error"}). Puede haber un cambio concurrente o un historial que requiere revisión. Recarga antes de reintentar; no se eludirán RLS ni la auditoría.`,
  );
}
function scoped(state: CardState, scope: CardBinding) {
  if (
    state.events.some(
      (e) =>
        e.match_id !== scope.matchId ||
        e.team_id !== scope.teamId ||
        e.player_id !== scope.playerId,
    )
  )
    throw new RosterError(
      "SCOPE",
      "Respuesta de tarjetas fuera del jugador/partido solicitado.",
    );
  return state;
}
export async function loadPlayerCards(
  client: SupabaseClient,
  scope: CardBinding,
) {
  await authorize(client, scope);
  const r = await client.rpc("mundialito_get_player_cards", {
    p_match_id: scope.matchId,
    p_team_id: scope.teamId,
    p_player_id: scope.playerId,
  });
  rpcError(r.error);
  return scoped(parseCardState(r.data), scope);
}
export async function savePlayerCards(
  client: SupabaseClient,
  binding: CardBinding & { requestId: string; state: CardState },
  raw: Record<string, unknown>,
  confirmed: boolean,
) {
  await authorize(client, binding);
  requirePhase4Write("cards");
  if (!confirmed || !isUuid(binding.requestId))
    throw new RosterError("VALIDATION", "Confirma las cantidades revisadas.");
  const state = scoped(parseCardState(binding.state), binding),
    values = cardValues(raw, state);
  const r = await client.rpc("mundialito_save_player_cards", {
    p_request_id: binding.requestId,
    p_match_id: binding.matchId,
    p_team_id: binding.teamId,
    p_player_id: binding.playerId,
    p_expected_basis: state.basis,
    p_yellows: values.yellows,
    p_direct_reds: values.directReds,
    p_yellow_cards: values.yellowCards,
    p_red_minute: values.redMinute,
    p_confirmed: true,
    p_clear_red_minute: values.clearRedMinute,
  });
  rpcError(r.error);
  const response = r.data;
  if (
    !response ||
    typeof response.repeated !== "boolean" ||
    typeof response.superseded !== "boolean"
  )
    throw new RosterError(
      "CONFIRMATION",
      "Respuesta de guardado inválida; recarga para comprobar las tarjetas.",
    );
  const saved = scoped(parseCardState(response.state), binding);
  const yellowEvents = saved.events.filter(
      (e) => e.event_type === "yellow_card",
    ),
    redEvents = saved.events.filter((e) => e.event_type === "red_card");
  if (
    yellowEvents.length !== values.yellows ||
    redEvents.length !== (values.outcome.cause ? 1 : 0) ||
    (redEvents[0] &&
      (redEvents[0].dismissal_cause !== values.outcome.cause ||
        redEvents[0].minute !== values.redMinute)) ||
    values.yellowCards.some(
      (c) =>
        c.id !== null &&
        !yellowEvents.some((e) => e.id === c.id && e.minute === c.minute),
    )
  )
    throw new RosterError(
      "CONFIRMATION",
      "El conjunto devuelto no coincide con las tarjetas guardadas. Recarga y solicita revisión antes de reintentar.",
    );
  if (
    response.points !== values.outcome.points ||
    response.dismissal_cause !== values.outcome.cause
  )
    throw new RosterError(
      "CONFIRMATION",
      "El cálculo guardado difiere de las cantidades; recarga y solicita revisión.",
    );
  return {
    state: saved,
    outcome: values.outcome,
    repeated: response.repeated as boolean,
    superseded: response.superseded as boolean,
  };
}
