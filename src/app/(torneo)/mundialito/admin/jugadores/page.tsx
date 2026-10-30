import Link from "next/link";
import { groupIds } from "@/lib/mundialito/data/teams";
import { getAdminRosterContext } from "@/lib/mundialito/players/admin";
import styles from "../admin.module.css";
export const metadata = { title: "Nóminas · Administración" };
export default async function PlayersPage() {
  const context = await getAdminRosterContext();
  return (
    <section className={styles.dashboard}>
      <p className={styles.eyebrow}>JUGADORES Y NÓMINAS</p>
      <h1>Selecciona un equipo</h1>
      <Link href="/mundialito/admin/jugadores/importar" className={styles.backLink}>
        Importación oficial autorizada · cuatro nóminas →
      </Link>
      <p className={styles.hint}>
        Los 18 equipos oficiales. Consulta la nómina, ficha jugadores o corrige
        sus datos.
      </p>
      <div className={styles.teamGroups}>
        {groupIds.map((group) => (
          <section key={group}>
            <h2>Grupo {group}</h2>
            <div className={styles.teamChoices}>
              {context.teams
                .filter((t) => t.group === group)
                .map((team) => (
                  <Link
                    key={team.id}
                    href={`/mundialito/admin/jugadores/${team.slug}`}
                    className={styles.teamChoice}
                  >
                    <strong>{team.name}</strong>
                    <span>Abrir nómina →</span>
                  </Link>
                ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
