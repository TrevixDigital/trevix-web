import Link from "next/link";
import { Trophy, GitBranch, Clock3, MapPin, Award } from "lucide-react";
import type { CSSProperties } from "react";
import type { BracketMatch, Participant } from "@/lib/mundialito/domain/types";
import type { CalendarDay } from "@/lib/mundialito/calendar";
import type { createCompetitionReport } from "@/lib/mundialito/repositories/competition-report";
import { bracketDefinitions } from "@/lib/mundialito/engine/bracket";
import { statusLabels } from "@/lib/mundialito/matches/model";
import { pendingLabels } from "@/components/mundialito/data-ui";
import styles from "./finals.module.css";
export interface FinalsPresentationProps { report: ReturnType<typeof createCompetitionReport>; calendar: {days:CalendarDay[]}; }
/** Layout follows the same official sources as progression, never reference artwork. */
export function finalsLayout(props:FinalsPresentationProps) {
  const matches=props.report.calculation.bracket;
  const match=(id:string)=>{const m=matches.find(m=>m.id===id);if(!m)throw new Error(`Falta el encuentro oficial ${id}`);return m;};
  const final=match(bracketDefinitions.find(d=>d.stage==="final")!.id);
  const definition=(id:string)=>bracketDefinitions.find(d=>d.id===id)!;
  const parents=(id:string)=>[definition(id).home,definition(id).away].map(s=>s.slice(2));
  const semis=parents(final.id).map(match),quarters=semis.flatMap(s=>parents(s.id).map(match));
  const third=match(bracketDefinitions.find(d=>d.stage==="third-place")!.id);
  return {quarters,semis,final,third,links:[...semis.map(s=>({from:parents(s.id),to:s.id})),{from:parents(final.id),to:final.id}]};
}
export function finalsMatchView(match:BracketMatch,{report,calendar}:FinalsPresentationProps) {
  const fixture=report.calculation.data.fixtures.find(f=>f.id===match.id),scheduled=calendar.days.flatMap(d=>d.matches).find(m=>m.id===match.id);
  const result=scheduled?.status==="scheduled"?undefined:match.result;
  const status=scheduled?.status??(result?.state==="confirmed"?"finished":result?.state==="live"?"live":"scheduled");
  const official=report.operations.find(o=>o.matchId===match.id)?.canPublishOfficial===true;
  const side=(participant:Participant)=>({participant,team:report.calculation.data.teams.find(t=>t.slug===participant.teamId)});
  const startsAt=scheduled?.startsAt??fixture?.startsAt;
  const champion=match.stage==="final"&&official&&status==="finished"&&result?.state==="confirmed"&&match.winnerId?report.calculation.data.teams.find(t=>t.slug===match.winnerId):undefined;
  return {fixture,result,status,official,home:side(match.home),away:side(match.away),champion,startsAt,when:startsAt?new Intl.DateTimeFormat("es-GT",{timeZone:"America/Guatemala",day:"2-digit",month:"short",hour:"numeric",minute:"2-digit",hour12:true}).format(new Date(startsAt)):null};
}
function MatchCard({match,...props}:FinalsPresentationProps&{match:BracketMatch}) {
  const view=finalsMatchView(match,props),grand=match.stage==="final";
  return <article className={`${styles.card} ${grand?styles.grandFinal:""}`} data-finals-id={match.id} data-participants={view.official?"confirmed":"projection"}>
    <header className={styles.cardHeader}><Link className={styles.code} href={`/mundialito/partidos/${encodeURIComponent(match.id)}`} aria-label={`Ficha del partido ${match.id}`}>{match.id}</Link>{grand&&<Trophy className={styles.finalEmblem} size={24} aria-hidden="true"/>}{!view.official&&(match.home.teamId||match.away.teamId)&&<span className={styles.projectionTag}>Proyección</span>}<span className={`${styles.status} ${view.status==="finished"?styles.finished:""}`}>{statusLabels[view.status]}</span></header>
    <div className={styles.teams} aria-label={view.result?"Marcador del partido":undefined}>
      {([view.home,view.away] as const).map((side,index)=><div key={index} className={`${styles.side} ${side.team?`group-${side.team.group.toLowerCase()}`:""}`} data-side={index?"away":"home"}><div className={styles.name}>{side.team?<><small>{side.participant.label}</small><Link className={styles.team} href={`/mundialito/equipos/${encodeURIComponent(side.team.slug)}`}>{side.team.name}</Link></>:<span className={`${styles.team} ${styles.openSlot}`}>{side.participant.label}</span>}</div>{view.result&&<strong className={styles.score}>{index?view.result.awayGoals:view.result.homeGoals}</strong>}</div>)}
      {!view.result&&<span className={styles.versus} aria-label="Encuentro sin marcador oficial">VS</span>}
    </div>
    {view.result?.penalties&&<p className={styles.penalties}>Penales: {view.result.penalties.home}–{view.result.penalties.away}</p>}
    {(view.when||view.fixture?.venue||match.pending.includes("penalties"))&&<footer className={styles.cardFooter}>{view.when&&<span><Clock3 size={12} aria-hidden="true"/><time dateTime={view.startsAt}>{view.when}</time></span>}{view.fixture?.venue&&<span><MapPin size={12} aria-hidden="true"/>{view.fixture.venue}</span>}{match.pending.includes("penalties")&&<span className={styles.issue}>Tanda de penales pendiente</span>}</footer>}
    {view.champion&&<p className={styles.champion}><Trophy size={15} aria-hidden="true"/><span>Campeón<strong>{view.champion.name}</strong></span></p>}
  </article>;
}
function Heading({kind,children}:{kind:"quarters"|"semis"|"final";children:string}) {
  const Icon=kind==="final"?Trophy:GitBranch;
  return <h2 className={`${styles.roundHeading} ${styles[kind+"Heading"]}`}><Icon size={24} aria-hidden="true"/>{children}</h2>;
}
function Connector({from,to,column,row,span}:{from:string[];to:string;column:number;row:number;span:number}) {
  return <div className={styles.merge} aria-hidden="true" data-connector-to={to} data-connector-from={from.join(",")} style={{"--column":column,"--row":row,"--span":span} as CSSProperties}><span className={styles.join}/><span className={styles.upperNode}/><span className={styles.lowerNode}/></div>;
}
export function FinalsPresentation(props:FinalsPresentationProps) {
  const layout=finalsLayout(props),snapshot=props.report.calculation,official=props.report.publication.status==="official";
  const pending=[...new Set([...snapshot.assignment.pending,...[...layout.quarters,...layout.semis,layout.final,layout.third].flatMap(m=>m.pending)])].filter(r=>r!=="results"&&r!=="penalties");
  return <>
    <aside className={styles.notice} aria-label="Estado de la fase final"><span>{official?"Cuadro confirmado":"Proyección"}</span><div><p>{official?"El recorrido sigue los emparejamientos confirmados del torneo.":"Los participantes se actualizarán conforme se confirmen los clasificados y los resultados de cada ronda."}</p>{pending.length>0&&<small>{pending.map(r=>pendingLabels[r]).join(" · ")}</small>}</div></aside>
    <div className={styles.bracket} aria-label="Cuadro de cuartos, semifinales y final">
      <Heading kind="quarters">Cuartos de final</Heading><Heading kind="semis">Semifinales</Heading><Heading kind="final">Gran final</Heading>
      {layout.quarters.map((m,i)=><div className={`${styles.slot} ${styles.quarterSlot}`} key={m.id} style={{"--column":1,"--row":i+2,"--span":1} as CSSProperties}><MatchCard {...props} match={m}/></div>)}
      {layout.semis.map((m,i)=><div className={`${styles.slot} ${styles.semiSlot}`} key={m.id} style={{"--column":3,"--row":i*2+2,"--span":2} as CSSProperties}><MatchCard {...props} match={m}/></div>)}
      <div className={`${styles.slot} ${styles.finalSlot}`} style={{"--column":5,"--row":2,"--span":4} as CSSProperties}><MatchCard {...props} match={layout.final}/></div>
      {layout.links.map((link,i)=><Connector key={link.to} {...link} column={i<2?2:4} row={i<2?i*2+2:2} span={i<2?2:4}/>)}
    </div>
    <div className={styles.placement}><section className={styles.third} aria-labelledby="third-title"><h2 id="third-title"><Award size={23} aria-hidden="true"/>Tercer lugar</h2><p>Los perdedores de S1 y S2</p><MatchCard {...props} match={layout.third}/></section></div>
    <p className={styles.footnote}>En caso de empate, tanda de penales. El marcador del partido y el resultado de la tanda se muestran por separado.</p>
  </>;
}
