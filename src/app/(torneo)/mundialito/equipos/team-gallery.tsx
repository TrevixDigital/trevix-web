import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { groupIds } from "@/lib/mundialito/data/teams";
import type { Team } from "@/lib/mundialito/domain/types";
import type { TournamentSnapshot } from "@/lib/mundialito/engine/tournament";
import styles from "./teams.module.css";
/** Same source and visibility as the existing catalog; presentation only. */
export function teamCardPresentation(team:Team,snapshot:TournamentSnapshot) {
  const stats=snapshot.groups.find(g=>g.group===team.group)?.rows.find(r=>r.team.slug===team.slug)?.stats;
  return {href:`/mundialito/equipos/${team.slug}`,stats:stats&&stats.played>0?stats:null};
}
export function TeamGallery({snapshot}:{snapshot:TournamentSnapshot}) {
  return <div className={styles.gallery}>{groupIds.map(group=>{
    const members=snapshot.data.teams.filter(t=>t.group===group);
    return <section key={group} className={`${styles.group} group-${group.toLowerCase()}`} aria-labelledby={`clubs-${group}`} data-club-group={group}>
      <header className={styles.groupHeading}><h2 id={`clubs-${group}`}><span>GRUPO</span><strong>{group}</strong></h2><span className={styles.groupRule} aria-hidden="true"/><span className={styles.groupCount}>{members.length} EQUIPOS OFICIALES</span></header>
      <div className={styles.cards}>{members.map(team=>{const view=teamCardPresentation(team,snapshot);return <Link href={view.href} className={styles.card} key={team.slug} data-team-slug={team.slug}>
        <span className={styles.kicker}>MUNDIALITO LA BOMBA · 2026</span><h3>{team.name}</h3>
        <div className={styles.cardBottom}>{view.stats&&<dl className={styles.stats} aria-label="Estadísticas de fase de grupos"><div><dt><abbr title="Partidos jugados">PJ</abbr></dt><dd>{view.stats.played}</dd></div><div><dt><abbr title="Puntos">PTS</abbr></dt><dd>{view.stats.points}</dd></div><div><dt><abbr title="Goles a favor">G</abbr></dt><dd>{view.stats.gf}</dd></div></dl>}<span className={styles.profile}>Ver perfil del equipo<ArrowUpRight size={16} aria-hidden="true"/></span></div>
      </Link>;})}</div>
    </section>;
  })}</div>;
}
