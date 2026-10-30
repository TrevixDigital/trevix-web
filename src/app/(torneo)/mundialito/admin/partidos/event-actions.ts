"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { serverAdminClient } from "@/lib/mundialito/admin/server";
import { RosterError } from "@/lib/mundialito/players/model";
import { saveEvent } from "@/lib/mundialito/events/repository";
export interface EventFormState {
  error: string;
  success?: { warnings: string[]; repeated: boolean; nextId: string };
}
export async function eventAction(
  binding: {
    id: string;
    matchId: string;
    mode: "create" | "edit" | "delete";
    version?: string;
  },
  _state: EventFormState,
  form: FormData,
): Promise<EventFormState> {
  try {
    const values: Record<string, unknown> = {};
    for (const k of ["team_id", "player_id", "event_type", "minute", "notes"])
      values[k] = form.get(k);
    if (values.event_type === "yellow_card" || values.event_type === "red_card")
      throw new RosterError(
        "CARDS",
        "Utiliza Tarjetas por jugador; el formulario de eventos registra goles y autogoles.",
      );
    const client = await serverAdminClient(true);
    const saved = await saveEvent(client, {
      ...binding,
      values,
      confirmed: form.get("confirm") === "on",
    });
    // Recording an event never changes results or participants of another match.
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
      `/mundialito/partidos/${saved.localId}`,
      `/mundialito/admin/partidos/${saved.matchId}/editar`,
    ])
      revalidatePath(path);
    revalidatePath("/mundialito/equipos/[slug]", "page");
    revalidatePath("/mundialito/jugadores/[slug]", "page");
    revalidatePath("/mundialito/partidos/[id]", "page");
    return {
      error: "",
      success: {
        warnings: saved.warnings,
        repeated: saved.repeated,
        nextId: randomUUID(),
      },
    };
  } catch (error) {
    return {
      error:
        error instanceof RosterError
          ? error.message
          : "No se pudo confirmar la operación. Recarga la lista y conserva el formulario antes de reintentar.",
    };
  }
}
