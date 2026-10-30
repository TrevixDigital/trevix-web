"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { serverAdminClient } from "@/lib/mundialito/admin/server";
import { RosterError } from "@/lib/mundialito/players/model";
import {
  loadPlayerCards,
  savePlayerCards,
  type CardBinding,
} from "@/lib/mundialito/events/card-repository";
import type { CardState } from "@/lib/mundialito/events/cards";
import { phase4Capabilities, requirePhase4Write } from "@/lib/mundialito/events/capabilities";
export interface CardFormState {
  error: string;
  loaded?: CardState & { requestId: string; scope: CardBinding };
  saved?: boolean;
  superseded?: boolean;
}
function configured() {
  if (!phase4Capabilities().read)
    throw new RosterError(
      "MIGRATION",
      "La lectura de tarjetas está desactivada en este entorno. El esquema instalado y la autorización de escritura se comprueban por separado.",
    );
}
function message(error: unknown) {
  return error instanceof RosterError
    ? error.message
    : "No se pudo confirmar la operación. Recarga las tarjetas antes de reintentar.";
}
export async function loadCardsAction(
  scope: CardBinding,
  _state: CardFormState,
  _form: FormData,
): Promise<CardFormState> {
  void _state;
  void _form;
  try {
    configured();
    const state = await loadPlayerCards(await serverAdminClient(), scope);
    return { error: "", loaded: { ...state, requestId: randomUUID(), scope } };
  } catch (error) {
    return { error: message(error) };
  }
}
export async function saveCardsAction(
  binding: CardBinding & { state: CardState; requestId: string },
  _state: CardFormState,
  form: FormData,
): Promise<CardFormState> {
  try {
    configured();
    const values: Record<string, unknown> = {};
    requirePhase4Write("cards");
    for (const key of [
      "yellows",
      "direct_reds",
      "yellow_id_0",
      "yellow_id_1",
      "yellow_minute_0",
      "yellow_minute_1",
      "red_minute",
      "clear_red_minute",
    ])
      values[key] = form.get(key);
    const saved = await savePlayerCards(
      await serverAdminClient(true),
      binding,
      values,
      form.get("confirm") === "on",
    );
    for (const path of [
      "/mundialito",
      "/mundialito/grupos",
      "/mundialito/estadisticas",
      "/mundialito/eliminatorias",
      "/mundialito/fase-final",
      "/mundialito/partidos",
      "/mundialito/admin/partidos",
      "/mundialito/admin/reglamento",
      "/mundialito/admin/estadisticas",
      `/mundialito/admin/partidos/${binding.matchId}/editar`,
    ])
      revalidatePath(path);
    for (const path of [
      "/mundialito/equipos/[slug]",
      "/mundialito/jugadores/[slug]",
      "/mundialito/partidos/[id]",
    ])
      revalidatePath(path, "page");
    return { error: "", saved: true, superseded: saved.superseded };
  } catch (error) {
    return { error: message(error) };
  }
}
