import Link from "next/link";
import { GitBranch, Trophy, Clock3, MapPin } from "lucide-react";
import type { BracketMatch, Participant } from "@/lib/mundialito/domain/types";
import type { CalendarDay } from "@/lib/mundialito/calendar";
import type { createCompetitionReport } from "@/lib/mundialito/repositories/competition-report";
import { statusLabels } from "@/lib/mundialito/matches/model";
import { pendingLabels } from "@/components/mundialito/data-ui";
import styles from "./knockout.module.css";

export interface KnockoutPresentationProps {
  report: ReturnType<typeof createCompetitionReport>;
  calendar: { days: CalendarDay[] };
}
// Presentation positions only. All sources and progression remain in the engine.
const round16Order = ["O1", "O5", "O2", "O6", "O3", "O7", "O4", "O8"];
export function knockoutPresentation(match: BracketMatch, { report, calendar }: KnockoutPresentationProps) {
  const fixture = report.calculation.data.fixtures.find(f => f.id === match.id);
  const scheduled = calendar.days.flatMap(d => d.matches).find(m => m.id === match.id);
  const result = scheduled?.status === "scheduled" ? undefined : match.result;
  const status = scheduled?.status ?? (result?.state === "confirmed" ? "finished" : result?.state === "live" ? "live" : "scheduled");
  const official = report.operations.find(o => o.matchId === match.id)?.canPublishOfficial === true;
  const side = (participant: Participant) => {
    const team = report.calculation.data.teams.find(t => t.slug === participant.teamId);
    return { participant, name: team?.name ?? participant.label, group: team?.group ?? participant.label.match(/^[12]\.º Grupo ([A-F])$/)?.[1], projected: !!participant.teamId && !official };
  };
  return { fixture, result, status, official, home: side(match.home), away: side(match.away),
    startsAt: scheduled?.startsAt ?? fixture?.startsAt,
    when: (scheduled?.startsAt ?? fixture?.startsAt) ? new Intl.DateTimeFormat("es-GT", { timeZone: "America/Guatemala", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date((scheduled?.startsAt ?? fixture?.startsAt)!)) : null };
}
function MatchCard({ match, ...props }: KnockoutPresentationProps & { match: BracketMatch }) {
  const view = knockoutPresentation(match, props);
  const hasProjection = view.home.projected || view.away.projected;
  return <article className={`${styles.card} ${view.home.group ? `group-${view.home.group.toLowerCase()}` : ""}`} data-knockout-id={match.id} data-participants={view.official ? "confirmed" : "projection"}>
    <header className={styles.cardHeader}>
      <Link className={styles.code} href={`/mundialito/partidos/${encodeURIComponent(match.id)}`} aria-label={`Ficha del partido ${match.id}`}>{match.id}</Link>
      {hasProjection && <span className={styles.projectionTag}>Proyección</span>}
      <span className={`${styles.status} ${view.status === "finished" ? styles.finished : view.status === "live" ? styles.live : ""}`}>{statusLabels[view.status]}</span>
    </header>
    <div className={styles.contest}>
      {([view.home, view.away] as const).map((side, index) => <div key={index} className={`${styles.side} ${index ? styles.away : ""} ${side.group ? `group-${side.group.toLowerCase()}` : ""}`} data-side={index ? "away" : "home"}>
        {side.participant.teamId && <small className={styles.source}>{side.participant.label}</small>}
        {side.participant.teamId ? <Link href={`/mundialito/equipos/${encodeURIComponent(side.participant.teamId)}`} className={styles.team}>{side.name}</Link> : <span className={`${styles.team} ${styles.openSlot}`}>{side.name}</span>}
      </div>)}
      <div className={styles.scoreBlock}><strong className={view.result ? styles.score : styles.versus} aria-label={view.result ? "Marcador del partido" : "Encuentro sin marcador oficial"}>{view.result ? <>{view.result.homeGoals}<span>–</span>{view.result.awayGoals}</> : "VS"}</strong>{view.result?.penalties && <small>Pen. {view.result.penalties.home}–{view.result.penalties.away}</small>}</div>
    </div>
    {(view.when || view.fixture?.venue || match.pending.includes("penalties")) && <footer className={styles.cardFooter}>
      {view.when && <span><Clock3 size={12} aria-hidden="true"/><time dateTime={view.startsAt}>{view.when}</time></span>}
      {view.fixture?.venue && <span><MapPin size={12} aria-hidden="true"/>{view.fixture.venue}</span>}
      {match.pending.includes("penalties") && <span className={styles.sportingIssue}>Tanda de penales pendiente</span>}
    </footer>}
  </article>;
}
export function KnockoutPresentation(props: KnockoutPresentationProps) {
  const { report } = props, snapshot = report.calculation;
  const octavos = snapshot.bracket.filter(m => m.stage === "round16").sort((a, b) => round16Order.indexOf(a.id) - round16Order.indexOf(b.id));
  const quarters = snapshot.bracket.filter(m => m.stage === "quarter");
  const official = report.publication.status === "official";
  const pending = [...new Set([...snapshot.assignment.pending, ...octavos.flatMap(m => m.pending)])].filter(r => r !== "results" && r !== "penalties");
  return <>
    <aside className={styles.notice} aria-label="Estado de los cruces"><span className={styles.noticeLabel}>{official ? "Cuadro confirmado" : "Proyección"}</span><div><p>{official ? "Clasificados y octavos confirmados según los artículos 11 y 12." : snapshot.complete ? "Cruces calculados, sujetos a los desempates y a la confirmación deportiva de participantes." : "Los cruces pueden cambiar hasta completar los grupos y resolver los desempates."}</p>{pending.length > 0 && <small>{pending.map(r => pendingLabels[r]).join(" · ")}</small>}</div></aside>
    <div className={styles.rounds}>
      <section className={styles.octavos} aria-labelledby="octavos-title"><header className={styles.roundHeading}><GitBranch size={27} aria-hidden="true"/><div><p>EL CAMINO A LA GLORIA</p><h2 id="octavos-title">Octavos <span>de final</span></h2></div><span className={styles.roundCount}>08 <small>encuentros</small></span></header><div className={styles.octavosGrid}>{octavos.map(match => <MatchCard {...props} match={match} key={match.id}/>)}</div></section>
      <section className={styles.quarters} aria-labelledby="quarters-title"><header className={styles.roundHeading}><Trophy size={27} aria-hidden="true"/><div><p>EL SIGUIENTE PASO</p><h2 id="quarters-title">Cuartos <span>de final</span></h2></div></header><div className={styles.quartersGrid}>{quarters.map(match => <MatchCard {...props} match={match} key={match.id}/>)}</div></section>
    </div>
    <p className={styles.footnote}>Sin prórroga. En caso de empate, tanda de penales. Sus goles no se suman a los goleadores ni a la diferencia de goles.</p>
  </>;
}
