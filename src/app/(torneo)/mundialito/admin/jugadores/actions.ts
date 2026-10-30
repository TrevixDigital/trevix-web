"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { serverAdminClient } from "@/lib/mundialito/admin/server";
import {
  publicPlayerSlug,
  RosterError,
  validatePlayerValues,
} from "@/lib/mundialito/players/model";
import { saveRosterPlayer } from "@/lib/mundialito/players/repository";
export interface PlayerFormState {
  error: string;
  success?: {
    id: string;
    name: string;
    warnings: string[];
    repeated: boolean;
    nextRegistrationId: string;
  };
}
export async function savePlayerAction(
  binding: {
    teamSlug: string;
    id: string;
    mode: "create" | "edit";
    version?: string;
  },
  _state: PlayerFormState,
  form: FormData,
): Promise<PlayerFormState> {
  try {
    const active = form.get("is_active");
    if (active !== null && active !== "on")
      throw new RosterError(
        "VALIDATION",
        "El estado del jugador no es válido.",
      );
    const values = validatePlayerValues({
      fullName: form.get("full_name"),
      shirtNumber: form.get("shirt_number"),
      position: form.get("position"),
      active: active === "on",
    });
    const result = await saveRosterPlayer(await serverAdminClient(true), {
      ...binding,
      values,
    });
    revalidatePath(`/mundialito/admin/jugadores/${result.team.slug}`);
    revalidatePath(
      `/mundialito/admin/jugadores/${result.team.slug}/${result.player.id}/editar`,
    );
    revalidatePath("/mundialito/admin/jugadores");
    revalidatePath(`/mundialito/equipos/${result.team.slug}`);
    revalidatePath(`/mundialito/jugadores/${publicPlayerSlug(result.player)}`);
    // Name and active-state changes also affect cached statistics and match cards.
    for (const path of ["/mundialito/estadisticas", "/mundialito/equipos", "/mundialito/admin/estadisticas"])
      revalidatePath(path);
    revalidatePath("/mundialito/partidos/[id]", "page");
    return {
      error: "",
      success: {
        id: result.player.id,
        name: result.player.fullName,
        warnings: result.warnings,
        repeated: result.repeated,
        nextRegistrationId: randomUUID(),
      },
    };
  } catch (error) {
    return {
      error:
        error instanceof RosterError
          ? error.message
          : "No se pudo confirmar el guardado. Revisa la nómina antes de volver a intentarlo.",
    };
  }
}
