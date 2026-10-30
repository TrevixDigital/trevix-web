"use server";
import { revalidatePath } from "next/cache";
import { serverAdminClient } from "@/lib/mundialito/admin/server";
import { RosterError } from "@/lib/mundialito/players/model";
import { saveAdminMatch } from "@/lib/mundialito/matches/repository";
import { fromLocalMatchDate } from "@/lib/mundialito/matches/model";
export interface MatchFormState {
  error: string;
  success?: { auditVerified: boolean; warning: string; repeated: boolean };
}
export async function saveMatchAction(
  binding: { id: string; version: string },
  _state: MatchFormState,
  form: FormData,
): Promise<MatchFormState> {
  try {
    const values: Record<string, unknown> = {};
    for (const field of [
      "status",
      "venue",
      "notes",
      "home_score",
      "away_score",
      "home_penalties",
      "away_penalties",
    ])
      values[field] = form.get(field);
    values.scheduled_at = fromLocalMatchDate(
      form.get("date"),
      form.get("time"),
    );
    const client = await serverAdminClient(true);
    const result = await saveAdminMatch(client, {
      ...binding,
      values,
      confirmed: form.get("confirm") === "on",
    });
    // Result save is one operation: no participant/event/certification writes are chained here.
    for (const path of [
      "/mundialito",
      "/mundialito/partidos",
      "/mundialito/grupos",
      "/mundialito/eliminatorias",
      "/mundialito/fase-final",
      "/mundialito/estadisticas",
      "/mundialito/equipos",
      "/mundialito/admin",
      "/mundialito/admin/partidos",
      "/mundialito/admin/reglamento",
      "/mundialito/admin/estadisticas",
      `/mundialito/admin/partidos/${result.id}/editar`,
      `/mundialito/partidos/${result.localId}`,
    ])
      revalidatePath(path);
    revalidatePath("/mundialito/equipos/[slug]", "page");
    revalidatePath("/mundialito/jugadores/[slug]", "page");
    revalidatePath("/mundialito/partidos/[id]", "page");
    revalidatePath("/mundialito/admin/partidos/[id]/editar", "page");
    return {
      error: "",
      success: {
        auditVerified: result.auditVerified,
        warning: result.warning,
        repeated: result.repeated,
      },
    };
  } catch (error) {
    return {
      error:
        error instanceof RosterError
          ? error.message
          : "No se pudo confirmar el guardado. Comprueba el partido antes de volver a enviarlo.",
    };
  }
}
