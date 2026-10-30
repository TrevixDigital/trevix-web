"use server";
import { revalidatePath } from "next/cache";
import { serverAdminClient } from "@/lib/mundialito/admin/server";
import { certifyMatchReview, type ReviewScope } from "@/lib/mundialito/events/reviews";
import { RosterError } from "@/lib/mundialito/players/model";
export interface ReviewFormState { error: string; saved?: boolean }
export async function certifyReviewAction(binding: ReviewScope & { version: string | null; basis?: string },
  _previous: ReviewFormState, form: FormData): Promise<ReviewFormState> {
  try {
    await certifyMatchReview(await serverAdminClient(true), binding, binding.version, {
      goals: form.get("goals") === "on", cards: form.get("cards") === "on",
      goalsReference: form.get("goalsReference"), cardsReference: form.get("cardsReference"),
      basis: binding.basis,
    }, form.get("confirm") === "on");
    for (const path of ["/mundialito", "/mundialito/grupos", "/mundialito/partidos", "/mundialito/eliminatorias", "/mundialito/fase-final", "/mundialito/estadisticas", "/mundialito/admin/partidos", "/mundialito/admin/reglamento", `/mundialito/admin/partidos/${binding.matchId}/editar`]) revalidatePath(path);
    for (const path of ["/mundialito/equipos/[slug]", "/mundialito/jugadores/[slug]", "/mundialito/partidos/[id]"]) revalidatePath(path, "page");
    return { error: "", saved: true };
  } catch (error) {
    return { error: error instanceof RosterError ? error.message : "No se confirmó la certificación. Actualiza el acta antes de reintentar; no se repetirá automáticamente." };
  }
}
