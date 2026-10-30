import type { SupabaseClient } from "@supabase/supabase-js";
import { checkAdminAccess } from "../admin/access.ts";
import { isUuid, RosterError } from "../players/model.ts";
import { readAdminMatches } from "../matches/repository.ts";
import {
  EVENT_COLUMNS,
  validateEventValues,
  type OfficialEvent,
  type EventValues,
} from "./model.ts";
import { readEvents, eventDuplicate, playerBelongs } from "./read.ts";
const fields = [
  "team_id",
  "player_id",
  "event_type",
  "minute",
  "notes",
] as const;
const same = (a: EventValues, b: EventValues) =>
  fields.every((k) => a[k] === b[k]);
export async function saveEvent(
  client: SupabaseClient,
  input: {
    id: string;
    matchId: string;
    mode: "create" | "edit" | "delete";
    version?: string;
    confirmed: boolean;
    values?: Record<string, unknown>;
  },
) {
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
      "Se requiere sesión administrativa válida para modificar eventos.",
    );
  if (
    !isUuid(input.id) ||
    !isUuid(input.matchId) ||
    !["create", "edit", "delete"].includes(input.mode) ||
    input.confirmed !== true
  )
    throw new RosterError(
      "VALIDATION",
      "Confirma la operación y comprueba la identidad del evento.",
    );
  const context = await readAdminMatches(client, true),
    match = context.metadata.matches.find((m) => m.id === input.matchId);
  if (!match)
    throw new RosterError(
      "NOT_FOUND",
      "Partido ajeno al torneo o no disponible.",
    );
  const events = context.events ?? [],
    existing = events.find((e) => e.id === input.id);
  if (existing && existing.match_id !== match.id)
    throw new RosterError("SCOPE", "El evento pertenece a otro partido.");
  if (input.mode !== "create" && !existing) {
    if (input.mode === "delete")
      return {
        id: input.id,
        matchId: match.id,
        localId: match.localId,
        repeated: true,
        warnings: ["El evento ya no existe; no se repitió la eliminación."],
      };
    throw new RosterError(
      "NOT_FOUND",
      "El evento no está disponible. Recarga el partido.",
    );
  }
  if (
    input.mode !== "create" &&
    (!input.version || !Number.isFinite(Date.parse(input.version)))
  )
    throw new RosterError(
      "VERSION",
      "Recarga la ficha para obtener su versión.",
    );
  const values =
    input.mode === "delete" ? null : validateEventValues(input.values ?? {});
  const warnings: string[] = [];
  if (
    (process.env.SUPABASE_PHASE4_READ_ENABLED === "true" || process.env.SUPABASE_PHASE4_CARDS_ENABLED === "true") &&
    [existing?.event_type, values?.event_type].some(
      (t) => t === "yellow_card" || t === "red_card",
    )
  )
    throw new RosterError(
      "CARDS",
      "Utiliza Tarjetas por jugador para sincronizar el conjunto de tarjetas en una sola operación.",
    );
  if (values) {
    if (
      ![match.homeTeamId, match.awayTeamId].includes(values.team_id) ||
      !playerBelongs(values.player_id, values.team_id, context.players ?? [])
    )
      throw new RosterError(
        "ROSTER",
        "Equipo o jugador fuera de la nómina participante.",
      );
    if (
      values.player_id &&
      (context.players ?? []).some(
        (p) => p.id === values.player_id && !p.active,
      )
    )
      warnings.push(
        "La ficha está inactiva actualmente. La elegibilidad en la fecha del encuentro requiere revisión oficial; no se presume una sanción ni se modifica el resultado.",
      );
    if (
      eventDuplicate(
        values,
        events.filter((e) => e.match_id === match.id),
        input.id,
      )
    )
      warnings.push(
        "Existe otro evento parecido. Se conserva como hecho independiente confirmado; no hay una restricción UNIQUE que permita fusionarlo automáticamente.",
      );
    if (values.event_type === "red_card")
      warnings.push(
        "Causa de expulsión pendiente de certificación: esta roja no se trata automáticamente como roja directa ni doble amarilla.",
      );
  }
  if (existing && input.mode !== "delete" && same(existing, values!))
    return {
      id: input.id,
      matchId: match.id,
      localId: match.localId,
      repeated: true,
      warnings,
    };
  if (existing && input.mode === "create")
    throw new RosterError(
      "REUSED",
      "Este formulario ya fue guardado con otros datos; usa Editar para corregirlo.",
    );
  if (existing && existing.updated_at !== input.version)
    throw new RosterError(
      "CONFLICT",
      "El evento cambió desde que lo abriste. Recarga antes de corregir o eliminar.",
    );
  let response;
  if (input.mode === "create")
    response = await client
      .from("match_events")
      .insert({
        id: input.id,
        tournament_id: context.metadata.tournament.id,
        match_id: match.id,
        ...values,
      })
      .select(EVENT_COLUMNS)
      .single();
  else {
    const query =
      input.mode === "delete"
        ? client.from("match_events").delete()
        : client.from("match_events").update(values!);
    response = await query
      .eq("id", input.id)
      .eq("tournament_id", context.metadata.tournament.id)
      .eq("match_id", match.id)
      .eq("team_id", existing!.team_id)
      .eq("updated_at", input.version!)
      .select(EVENT_COLUMNS)
      .maybeSingle();
  }
  if (response.error) {
    if (input.mode === "create" && response.error.code === "23505") {
      const after = (
        await readEvents(client, context.metadata.tournament.id)
      ).find((e) => e.id === input.id);
      if (after && after.match_id === match.id && same(after, values!))
        return {
          id: input.id,
          matchId: match.id,
          localId: match.localId,
          repeated: true,
          warnings,
        };
    }
    throw new RosterError(
      response.error.code ?? "DATABASE",
      `No se confirmó el evento (${response.error.code ?? "error"}). Revisa RLS, restricciones o triggers; no se eludirán. Comprueba la lista antes de reintentar.`,
    );
  }
  const row = response.data as unknown as OfficialEvent | null;
  if (
    !row ||
    row.id !== input.id ||
    row.match_id !== match.id ||
    row.tournament_id !== context.metadata.tournament.id ||
    (values && !same(row, values))
  )
    throw new RosterError(
      "CONFIRMATION",
      "No se confirmó la fila solicitada; recarga la lista antes de volver a enviar.",
    );
  return {
    id: row.id,
    matchId: match.id,
    localId: match.localId,
    repeated: false,
    warnings,
  };
}
