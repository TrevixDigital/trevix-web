import "server-only";
import { join } from "node:path";
import { privateDirectory } from "./private-storage";
import { randomUUID } from "node:crypto";
import { decodeRosterFile } from "./import-preview";
import { isUuid, RosterError } from "./model";
import {
  OFFICIAL_FILES,
  verifyImportAdmin,
  type OfficialRun,
} from "./official-import";
import type { SupabaseClient } from "@supabase/supabase-js";

// External rosters and mutable journals are runtime data, not build assets.
// Load Node's filesystem at runtime so Next does not bundle/trace the external folder.
const { readFile, mkdir, writeFile, rename, open, unlink } =
  process.getBuiltinModule("fs").promises;

const directory = () =>
  privateDirectory(process.env.OFFICIAL_IMPORT_RUNS_DIR, "OFFICIAL_IMPORT_RUNS_DIR");
export async function officialSourceFiles() {
  const source = privateDirectory(process.env.OFFICIAL_ROSTERS_DIR, "OFFICIAL_ROSTERS_DIR");
  // Four fixed, hash-verified files only. Never accept a browser-supplied path.
  const buffers = await Promise.all(OFFICIAL_FILES.map(policy => readFile(join(source, policy.file))));
  return OFFICIAL_FILES.map((p, i) => decodeRosterFile(p.file, buffers[i]));
}
function runPath(id: string) {
  if (!isUuid(id))
    throw new RosterError("RUN", "Identificador de ejecución no válido.");
  return join(directory(), `${id}.json`);
}
export async function persistOfficialRun(run: OfficialRun, initial = false) {
  await mkdir(directory(), { recursive: true });
  const path = runPath(run.id),
    body = JSON.stringify(run, null, 2);
  if (initial) await writeFile(path, body, { flag: "wx" });
  else {
    const temp = join(directory(), `${run.id}.${randomUUID()}.tmp`);
    await writeFile(temp, body, { flag: "wx" });
    await rename(temp, path);
  }
}
export async function loadOfficialRun(client: SupabaseClient, id: string) {
  const owner = await verifyImportAdmin(client);
  const run = JSON.parse(await readFile(runPath(id), "utf8")) as OfficialRun;
  if (run.id !== id || run.version !== 1 || run.owner !== owner)
    throw new RosterError("ACCESS", "No puedes acceder a esta ejecución.");
  return run;
}
export async function withOfficialLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  await mkdir(directory(), { recursive: true });
  const path = join(directory(), "official-import.lock");
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(path, "wx");
  } catch {
    throw new RosterError(
      "LOCK",
      "Hay otra operación de importación en curso o un bloqueo pendiente de revisar. No abras una ejecución paralela.",
    );
  }
  try {
    return await operation();
  } finally {
    await handle.close();
    await unlink(path);
  }
}
export function publicRun(run: OfficialRun) {
  return {
    id: run.id,
    createdAt: run.createdAt,
    planHash: run.planHash,
    cursor: run.cursor,
    total: run.targets.length,
    outcomes: run.outcomes,
    error: run.error,
    errors: run.errors,
    complete: run.complete,
    verification: run.verification,
  };
}
export type PublicOfficialRun = ReturnType<typeof publicRun>;
