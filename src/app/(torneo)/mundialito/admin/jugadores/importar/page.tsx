import Link from "next/link";
import { requireAdministrator } from "@/lib/mundialito/admin/server";
import { officialPlan, OFFICIAL_FILES } from "@/lib/mundialito/players/official-import";
import {
  officialSourceFiles,
  loadOfficialRun,
  publicRun,
} from "@/lib/mundialito/players/official-import-server";
import { OfficialImportPanel } from "./panel";
import styles from "../../admin.module.css";
export const metadata = { title: "Importación autorizada · Administración" };
export const runtime = "nodejs";
export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const client = await requireAdministrator(),
    query = await searchParams;
  const plan = await officialPlan(client, await officialSourceFiles());
  const initial = query.run
    ? publicRun(await loadOfficialRun(client, query.run))
    : undefined;
  return (
    <section className={styles.dashboard}>
      <Link href="/mundialito/admin/jugadores" className={styles.backLink}>
        ← Jugadores
      </Link>
      <h1>Importación oficial autorizada</h1>
      <p className={styles.notice}>
        Exclusivamente La Bomba, Sagrado, San Julián y Villa Hermosa. Se
        excluyen las plazas 24 y 25 vacías de San Julián y se elimina únicamente
        el espacio final autorizado del registro 5 de Villa Hermosa. Los jugadores existentes
        se conservan sin cambios. San Diego y los demás archivos están
        excluidos.
      </p>
      <p className={styles.hint}>
        Mientras se ejecuta, evita fichajes o ediciones manuales en estos
        equipos. La ejecución registra cada paso, se detiene ante errores y
        puede reanudarse con el mismo enlace.
      </p>
      <div className={styles.teamGroups}>
        {OFFICIAL_FILES.map((p) => {
          const entries = plan.entries.filter((e) => e.teamSlug === p.slug),
            team = plan.context.teams.find((t) => t.slug === p.slug)!;
          return (
            <article className={styles.formPanel} key={p.slug}>
              <h2>{team.name}</h2>
              <p>
                {p.count} nombres ·{" "}
                {entries.filter((e) => e.status === "create").length} nuevos ·{" "}
                {entries.filter((e) => e.status === "existing").length}{" "}
                existentes ·{" "}
                {entries.filter((e) => e.status === "review").length} pendientes
              </p>
              <details>
                <summary>Ver nombres y decisiones</summary>
                <ul>
                  {entries.map((e) => (
                    <li key={e.proposal.id}>
                      {e.name} —{" "}
                      {e.status === "create"
                        ? "Insertar con dorsal y posición NULL"
                        : e.status === "existing"
                          ? "Conservar ficha existente"
                          : "Pendiente de revisión"}
                      . {e.reason}
                    </li>
                  ))}
                </ul>
              </details>
            </article>
          );
        })}
      </div>
      <OfficialImportPanel planHash={plan.planHash} initial={initial} />
    </section>
  );
}
