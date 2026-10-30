"use server";
import { revalidatePath } from "next/cache";
import { serverAdminClient } from "@/lib/mundialito/admin/server";
import { saveSimpleActa } from "@/lib/mundialito/events/simple-save";
import type { SimpleBinding, SimpleInput, SimpleSaveState } from "@/lib/mundialito/events/simple-acta";

export async function saveSimpleActaAction(binding: SimpleBinding, _state: SimpleSaveState, form: FormData): Promise<SimpleSaveState> {
  try {
    const raw = form.get("totals");
    if (typeof raw !== "string" || raw.length > 250000)
      return {error:"No se pudo leer la nómina. Recarga el partido.",completed:[]};
    const input: SimpleInput = {
      status:String(form.get("status")??""),home_score:String(form.get("home_score")??""),away_score:String(form.get("away_score")??""),
      home_penalties:String(form.get("home_penalties")??""),away_penalties:String(form.get("away_penalties")??""),totals:JSON.parse(raw),
    };
    return await saveSimpleActa(await serverAdminClient(true),binding,input);
  } catch {
    return {error:"No se pudo preparar el guardado. Comprueba tu sesión y vuelve a intentarlo.",completed:[]};
  } finally {
    // Even a partially completed operation must become visible on subsequent reads.
    for(const path of ["/mundialito","/mundialito/grupos","/mundialito/partidos","/mundialito/estadisticas","/mundialito/equipos","/mundialito/eliminatorias","/mundialito/fase-final","/mundialito/admin","/mundialito/admin/partidos","/mundialito/admin/estadisticas",`/mundialito/admin/partidos/${binding.id}/editar`]) revalidatePath(path);
    for(const path of ["/mundialito/equipos/[slug]","/mundialito/jugadores/[slug]","/mundialito/partidos/[id]"]) revalidatePath(path,"page");
    revalidatePath("/mundialito/admin/partidos/[id]/editar","page");
  }
}
