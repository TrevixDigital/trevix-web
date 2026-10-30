import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminTeamRoster } from "@/lib/mundialito/players/admin";
import { RosterList } from "../roster-list";
import styles from "../../admin.module.css";
export default async function TeamRoster({
  params,
}: {
  params: Promise<{ equipo: string }>;
}) {
  const { equipo } = await params,
    roster = await getAdminTeamRoster(equipo);
  if (!roster) notFound();
  return (
    <section className={styles.dashboard}>
      <Link className={styles.backLink} href="/mundialito/admin/jugadores">
        ← Cambiar equipo
      </Link>
      <div className={styles.rosterHeading}>
        <div>
          <p className={styles.eyebrow}>
            GRUPO {roster.team.group} · NÓMINA OFICIAL
          </p>
          <h1>{roster.team.name}</h1>
        </div>
        <Link
          className={styles.primary}
          href={`/mundialito/admin/jugadores/${equipo}/nuevo`}
        >
          + Fichar jugador
        </Link>
      </div>
      <RosterList players={roster.players} teamSlug={equipo} />
    </section>
  );
}
