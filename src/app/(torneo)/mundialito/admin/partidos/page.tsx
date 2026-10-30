import styles from "../admin.module.css";
import { requireAdministrator } from "@/lib/mundialito/admin/server";
import { readAdminMatches } from "@/lib/mundialito/matches/repository";
import { MatchBrowser } from "./match-browser";
import type { MatchCard } from "./match-browser";
import Link from "next/link";
export default async function MatchesModule() {
  const data = await readAdminMatches(await requireAdministrator());
  const matches: MatchCard[] = data.metadata.matches.map((m) => {
    const raw = data.records.find((r) => r.id === m.id)!,
      b = data.snapshot.bracket.find((b) => b.id === m.localId),
      day = data.metadata.matchdays.find((d) => d.id === m.matchdayId);
    const name = (id: string | null) =>
      data.metadata.teams.find((t) => t.id === id)?.name;
    return {
      id: m.id,
      number: m.matchNumber,
      phase: m.phase as MatchCard["phase"],
      dayId: m.matchdayId,
      dayNumber: day?.number ?? null,
      group:
        data.metadata.groups.find((g) => g.id === m.groupId)?.localGroup ??
        null,
      home: name(m.homeTeamId) ?? b?.home.label ?? "Por definir",
      away: name(m.awayTeamId) ?? b?.away.label ?? "Por definir",
      status: m.status,
      at: m.scheduledAt,
      venue: m.venue,
      homeScore: raw.home_score as number | null,
      awayScore: raw.away_score as number | null,
      penalties:
        raw.home_penalties !== null && raw.away_penalties !== null
          ? `${raw.home_penalties} – ${raw.away_penalties}`
          : null,
    };
  });
  return (
    <section className={styles.dashboard}>
      <p className={styles.eyebrow}>CALENDARIO Y RESULTADOS OFICIALES</p>
      <h1>Partidos</h1>
      <Link href="/mundialito/admin/reglamento" className={styles.secondary}>Clasificación, sorteos y octavos →</Link>
      <p className={styles.notice}>
        Selecciona fase, jornada y encuentro. Solo los resultados finalizados
        alimentan las tablas; las tandas se guardan por separado.
      </p>
      <MatchBrowser matches={matches} />
    </section>
  );
}
