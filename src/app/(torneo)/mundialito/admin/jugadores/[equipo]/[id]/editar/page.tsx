import { notFound } from "next/navigation";
import { getAdminPlayer, getAdminTeamRoster } from "@/lib/mundialito/players/admin";
import { PlayerForm } from "../../../player-form";
import styles from "../../../../admin.module.css";
export default async function EditPlayer({
  params,
}: {
  params: Promise<{ equipo: string; id: string }>;
}) {
  const { equipo, id } = await params,
    record = await getAdminPlayer(equipo, id);
  if (!record) notFound();
  const roster = await getAdminTeamRoster(equipo);
  return (
    <section className={styles.dashboard}>
      <p className={styles.eyebrow}>
        GRUPO {record.team.group} · {record.team.name}
      </p>
      <h1>Editar jugador</h1>
      <PlayerForm
        key={id}
        team={record.team}
        id={id}
        player={record.player}
        roster={roster!.players}
      />
    </section>
  );
}
