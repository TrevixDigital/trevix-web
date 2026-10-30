import type { SupabaseClient } from "@supabase/supabase-js";
import { readAdminMatches } from "./repository.ts";
import { checkAdminAccess } from "../admin/access.ts";
import { RosterError } from "../players/model.ts";
import { classificationWritesEnabled } from "./classification-admin.ts";
export function knockoutSyncPlan(
  context: Awaited<ReturnType<typeof readAdminMatches>>,
) {
  const changes: {
      id: string;
      localId: string;
      home: string;
      away: string;
      version: string;
      oldHome: string | null;
      oldAway: string | null;
      phase: string;
      code: string;
    }[] = [],
    conflicts: string[] = [];
  let pending = 0;
  for (const bracket of context.snapshot.bracket) {
    const m = context.metadata.matches.find((m) => m.localId === bracket.id)!,
      row = context.records.find((r) => r.id === m.id)!;
    if (
      bracket.state !== "confirmed" ||
      !bracket.home.teamId ||
      !bracket.away.teamId
    ) {
      pending++;
      continue;
    }
    const home = context.metadata.teams.find(
        (t) => t.localSlug === bracket.home.teamId,
      )!.id,
      away = context.metadata.teams.find(
        (t) => t.localSlug === bracket.away.teamId,
      )!.id;
    if (m.homeTeamId === home && m.awayTeamId === away) continue;
    if (
      m.status !== "scheduled" ||
      m.groupId !== null ||
      ["home_score", "away_score", "home_penalties", "away_penalties"].some(
        (k) => row[k] !== null,
      ) ||
      (m.homeTeamId !== null && m.homeTeamId !== home) ||
      (m.awayTeamId !== null && m.awayTeamId !== away)
    ) {
      conflicts.push(bracket.id);
      continue;
    }
    changes.push({
      id: m.id,
      localId: m.localId,
      home,
      away,
      version: row.updated_at as string,
      oldHome: m.homeTeamId,
      oldAway: m.awayTeamId,
      phase: m.phase,
      code: m.bracketCode!,
    });
  }
  return { changes, conflicts, pending };
}
export async function syncConfirmedParticipants(client: SupabaseClient, options?:{sportingBasis:string}) {

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
      "No se autorizó la actualización de cruces.",
    );
  if (!options) return {
    assigned: [],
    warnings: ["Solo proyecci\u00f3n: no se guardaron participantes. Falta aprobaci\u00f3n deportiva por la ruta segura."],
  };
  if (!classificationWritesEnabled()) throw new RosterError("CAPABILITY", "La escritura de clasificados permanece desactivada.");
  const warnings: string[] = [];
  const basisRead=await client.rpc("mundialito_group_basis",undefined,{get:true});
  if(basisRead.error||typeof basisRead.data!=="string")throw new RosterError("CAPABILITY","La asignación segura de octavos no está instalada o disponible.");
  const context = await readAdminMatches(client, true),
    plan = knockoutSyncPlan(context);
  const validSporting=(c:typeof context)=>classificationWritesEnabled()&&c.classification?.circuit.ready&&!!c.classification.confirmation&&c.classification.confirmationBasis===options?.sportingBasis;
  if(!validSporting(context))throw new RosterError("CLASSIFICATION","La confirmación deportiva no está vigente o la escritura está desactivada.");
  if(plan.conflicts.some(id=>id.startsWith("O")))return {assigned:[],warnings:[`Hay rivales o resultados ya registrados que no coinciden con la nueva clasificación: ${plan.conflicts.filter(id=>id.startsWith("O")).join(", ")}. No se sobrescribió ningún cruce.`],pending:plan.pending};
  {
    const p_plan=context.snapshot.bracket.filter(b=>b.stage==="round16").map(b=>{
      const m=context.metadata.matches.find(m=>m.localId===b.id)!;
      return {id:m.id,version:context.records.find(r=>r.id===m.id)!.updated_at,home:context.metadata.teams.find(t=>t.localSlug===b.home.teamId)!.id,away:context.metadata.teams.find(t=>t.localSlug===b.away.teamId)!.id};
    });
    const r=await client.rpc("mundialito_assign_octavos",{p_group_basis:basisRead!.data,p_plan});
    if(r.error||!Array.isArray(r.data?.assigned))throw new RosterError(r.error?.code??"CONFIRMATION","No se confirmó la asignación atómica de octavos; comprueba activación en base de datos, dependencias y datos actuales. No se guardan cruces parciales.");
    const after=await readAdminMatches(client,true);
    if(!validSporting(after)||!after.classification?.persisted)warnings.push("No se pudo comprobar la asignación con los datos actuales; recarga.");
    return {assigned:r.data.assigned as string[],warnings,pending:plan.pending};
  }
}
