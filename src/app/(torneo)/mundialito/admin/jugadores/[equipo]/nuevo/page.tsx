import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { getAdminTeamRoster } from "@/lib/mundialito/players/admin";
import { isUuid } from "@/lib/mundialito/players/model";
import { PlayerForm } from "../../player-form";
import styles from "../../../admin.module.css";
export default async function NewPlayer({
  params,
  searchParams,
}: {
  params: Promise<{ equipo: string }>;
  searchParams: Promise<{ ficha?: string }>;
}) {
  const { equipo } = await params,
    roster = await getAdminTeamRoster(equipo);
  if (!roster) notFound();
  const { ficha } = await searchParams;
  // One stable registration UUID per form URL gives retries the same database PK.
  if (!isUuid(ficha))
    redirect(`/mundialito/admin/jugadores/${equipo}/nuevo?ficha=${randomUUID()}`);
  return (
    <section className={styles.dashboard}>
      <p className={styles.eyebrow}>
        GRUPO {roster.team.group} · {roster.team.name}
      </p>
      <h1>Fichar jugador</h1>
      <PlayerForm
        key={ficha}
        team={roster.team}
        id={ficha}
        roster={roster.players}
      />
    </section>
  );
}
