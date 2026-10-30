import Link from "next/link";
import { CalendarDays, MapPin, Trophy, Clock3, ChevronDown } from "lucide-react";
import type { CalendarDay, CalendarMatch } from "@/lib/mundialito/calendar";
import type { TournamentSnapshot } from "@/lib/mundialito/engine/tournament";
import { statusLabels } from "@/lib/mundialito/matches/model";
import styles from "./matches.module.css";

export interface CalendarPresentationProps {
  calendar: { days: CalendarDay[]; next: CalendarDay | null; last: CalendarDay | null };
  snapshot: TournamentSnapshot;
}
const phaseNames = { groups:"Fase de grupos",round16:"Octavos",quarter:"Cuartos de final",semi:"Semifinal", "third-place":"Tercer lugar",final:"Final" };
export function matchPresentation(match: CalendarMatch, snapshot: TournamentSnapshot) {
  const fixture=snapshot.data.fixtures.find(f=>f.id===match.id);
  if(!fixture)throw new Error("El encuentro no pertenece al calendario leído.");
  const bracket=snapshot.bracket.find(b=>b.id===fixture.id);
  const name=(id:string|undefined,fallback:string)=>id?snapshot.data.teams.find(t=>t.slug===id)?.name??fallback:fallback;
  // Keep unassigned knockout sources as sources; never publish projected teams as stored participants.
  const home=name(fixture.homeTeamId,bracket?.home.label??"Local por definir");
  const away=name(fixture.awayTeamId,bracket?.away.label??"Visitante por definir");
  const result=match.status==="scheduled"?undefined:snapshot.data.results.find(r=>r.matchId===fixture.id);
  return {fixture,home,away,result,status:statusLabels[match.status],date:match.startsAt?new Intl.DateTimeFormat("es-GT",{timeZone:"America/Guatemala",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(match.startsAt)):null,
    time:match.startsAt?new Intl.DateTimeFormat("es-GT",{timeZone:"America/Guatemala",hour:"numeric",minute:"2-digit",hour12:true}).format(new Date(match.startsAt)):"Hora por confirmar"};
}
function DayLabel({day}:{day:CalendarDay}) {
  return <div className={styles.dayLabel}><CalendarDays size={17} aria-hidden="true"/><div><strong>{day.number!==null?`Jornada ${day.number}`:"Jornada por confirmar"}</strong><span>{day.date?new Intl.DateTimeFormat("es-GT",{timeZone:"UTC",dateStyle:"long"}).format(new Date(`${day.date}T12:00:00Z`)):"Fecha por confirmar"}</span></div></div>;
}
export function MatchRows({matches,snapshot}:{matches:CalendarMatch[];snapshot:TournamentSnapshot}) {
  return <ul className={styles.matches}>{matches.map(match=>{
    const view=matchPresentation(match,snapshot);
    return <li key={match.id} className={`${styles.matchRow} ${view.fixture.group?`group-${view.fixture.group.toLowerCase()}`:""}`} data-match-id={match.id} data-match-status={match.status}>
      <Link href={`/mundialito/partidos/${encodeURIComponent(match.id)}`} className={styles.matchLink}>
        <div className={styles.rowTop}><span className={view.fixture.group?styles.groupTag:styles.phaseTag}>{view.fixture.group?`GRUPO ${view.fixture.group}`:phaseNames[view.fixture.stage]}</span>{match.number!==null&&<span className={styles.matchNumber}>PARTIDO {String(match.number).padStart(2,"0")}</span>}<span className={`${styles.status} ${match.status==="finished"?styles.finished:match.status==="live"?styles.live:""}`}>{view.status}</span></div>
        <div className={styles.contest}><span className={styles.home}>{view.home}</span><div className={styles.scoreBlock}><strong className={view.result?styles.score:styles.versus} aria-label={view.result?"Marcador del partido":"Encuentro sin marcador oficial"}>{view.result?<>{view.result.homeGoals}<span>–</span>{view.result.awayGoals}</>:"VS"}</strong>{view.result?.penalties&&<small>Pen. {view.result.penalties.home}–{view.result.penalties.away}</small>}</div><span className={styles.away}>{view.away}</span></div>
        <div className={styles.rowBottom}><span className={styles.when}><Clock3 size={12} aria-hidden="true"/>{view.date&&<span>{view.date}<i>·</i></span>}<time dateTime={match.startsAt??undefined}>{view.time}</time></span>{view.fixture.venue&&<span className={styles.venue}><MapPin size={12} aria-hidden="true"/>{view.fixture.venue}</span>}</div>
      </Link>
    </li>;
  })}</ul>;
}
function Empty({title,children}:{title:string;children:string}) {
  return <div className={styles.empty}><p>{title}</p><span>{children}</span></div>;
}
export function CalendarPresentation({calendar,snapshot}:CalendarPresentationProps) {
  // Same official-state selection used by the existing calendar view.
  const last=calendar.last?.matches.filter(m=>m.status==="finished"&&snapshot.data.results.some(r=>r.matchId===m.id&&r.state==="confirmed"))??[];
  const next=calendar.next?.matches.filter(m=>m.status==="scheduled")??[];
  return <>
    <div className={styles.highlights}>
      <section className={styles.panel} aria-labelledby="last-matchday-title"><header className={styles.panelHeading}><div className={styles.panelTitle}><Trophy size={24} aria-hidden="true"/><div><p>EL MARCADOR</p><h2 id="last-matchday-title">Última fecha <span>disputada</span></h2></div></div>{calendar.last&&<DayLabel day={calendar.last}/>}</header>
        {last.length?<MatchRows matches={last} snapshot={snapshot}/>:<Empty title="Sin resultados oficiales publicados">Aquí aparecerá la última jornada con encuentros finalizados. Una fecha pasada no implica que se haya disputado.</Empty>}
      </section>
      <section className={`${styles.panel} ${styles.nextPanel}`} aria-labelledby="next-matchday-title"><header className={styles.panelHeading}><div className={styles.panelTitle}><CalendarDays size={24} aria-hidden="true"/><div><p>LO QUE VIENE</p><h2 id="next-matchday-title">Próxima <span>fecha</span></h2></div></div>{calendar.next&&<DayLabel day={calendar.next}/>}</header>
        {calendar.next?<MatchRows matches={next} snapshot={snapshot}/>:<Empty title="Sin próxima fecha programada">Consulta el calendario completo para ver los encuentros pendientes y las fechas por confirmar.</Empty>}
      </section>
    </div>
    <details className={styles.fullCalendar}><summary><span>Ver calendario completo<small>{snapshot.data.fixtures.length} partidos · Todas las jornadas</small></span><ChevronDown size={20} aria-hidden="true"/></summary><div className={styles.days}>{calendar.days.length?calendar.days.map(day=><section className={styles.calendarDay} key={day.id}><DayLabel day={day}/><MatchRows matches={day.matches} snapshot={snapshot}/></section>):<Empty title="Calendario por confirmar">Las jornadas aparecerán cuando la organización publique su programación.</Empty>}</div></details>
  </>;
}
