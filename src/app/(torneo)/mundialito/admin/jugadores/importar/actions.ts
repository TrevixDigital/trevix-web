"use server";
import { revalidatePath } from "next/cache";
import { serverAdminClient } from "@/lib/mundialito/admin/server";
import { RosterError, publicPlayerSlug } from "@/lib/mundialito/players/model";
import {
  createOfficialRun,
  executeOfficialBatch,
  verifyImportAdmin,
} from "@/lib/mundialito/players/official-import";
import {
  officialSourceFiles,
  persistOfficialRun,
  loadOfficialRun,
  withOfficialLock,
  publicRun,
  type PublicOfficialRun,
} from "@/lib/mundialito/players/official-import-server";

type Response = { error: string; run?: PublicOfficialRun };
const message = (error: unknown) =>
  error instanceof RosterError
    ? error.message
    : "No se pudo confirmar la operación o registrar el informe local. Conserva el enlace de la ejecución y consulta su estado antes de reintentar.";
export async function startOfficialImport(planHash: string): Promise<Response> {
  try {
    const client = await serverAdminClient(true);
    await verifyImportAdmin(client);
    return await withOfficialLock(async () => {
      const run = await createOfficialRun(
        client,
        await officialSourceFiles(),
        planHash,
      );
      await persistOfficialRun(run, true);
      return { error: "", run: publicRun(run) };
    });
  } catch (error) {
    return { error: message(error) };
  }
}
export async function continueOfficialImport(id: string): Promise<Response> {
  try {
    const client = await serverAdminClient(true);
    await verifyImportAdmin(client);
    return await withOfficialLock(async () => {
      const run = await loadOfficialRun(client, id);
      const result = await executeOfficialBatch(
        client,
        await officialSourceFiles(),
        run,
        persistOfficialRun,
      );
      // Refresh pages even if the batch stopped after confirming some rows.
      revalidatePath("/mundialito/admin/jugadores");
      for (const slug of new Set(run.targets.map((t) => t.teamSlug))) {
        revalidatePath(`/mundialito/admin/jugadores/${slug}`);
        revalidatePath(`/mundialito/equipos/${slug}`);
      }
      for (const outcome of result.outcomes)
        if (outcome.id) {
          // Existing slugs are retained; UUID aliases are also resolved by the public reader.
          const target = run.targets[outcome.index];
          const existing = run.baseline.find((p) => p.id === outcome.id);
          revalidatePath(
            `/mundialito/jugadores/${publicPlayerSlug(existing ?? { id: outcome.id, slug: target.proposal.slug })}`,
          );
        }
      return { error: result.error, run: publicRun(result) };
    });
  } catch (error) {
    return { error: message(error) };
  }
}
