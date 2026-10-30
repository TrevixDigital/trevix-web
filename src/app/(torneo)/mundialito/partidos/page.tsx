import type { CSSProperties } from "react";
import { getImageProps } from "next/image";
import { getCalendar, getTournament } from "@/lib/mundialito/repositories/tournament";
import { assetPath } from "@/lib/mundialito/site";
import { CalendarPresentation } from "./calendar-presentation";
import styles from "./matches.module.css";
export const metadata = { title: "Partidos" };
export default async function Page() {
  const [calendar,snapshot]=await Promise.all([getCalendar(),getTournament()]);
  const hero=assetPath("/images/matches/matchday-tikal-original.webp");
  const {props:desktop}=getImageProps({src:hero,width:1900,height:704,alt:"",sizes:"100vw",loading:"eager",fetchPriority:"high"});
  const {props:mobile}=getImageProps({src:assetPath("/images/matches/matchday-tikal-mobile.webp"),width:900,height:1000,alt:"",sizes:"100vw",loading:"eager",fetchPriority:"high"});
  const art={"--matches-art":`url("${hero}")`,"--matches-background":`url("${assetPath("/images/matches/peten-dusk-background.webp")}")`} as CSSProperties;
  return (
    <div className={styles.page} style={art}>
      <section className={styles.hero} aria-labelledby="matches-title">
        <div className={styles.heroArt} aria-hidden="true"><picture><source media="(max-width: 600px)" srcSet={mobile.srcSet} sizes="100vw"/><img {...desktop} alt=""/></picture></div>
        <div className={`${styles.shell} ${styles.heroContent}`}><p className={styles.eyebrow}>MUNDIALITO LA BOMBA · 2026</p><h1 id="matches-title">PARTI<span>DOS</span></h1><p className={styles.heroCopy}>Cada encuentro, una historia.<br/>La pasión de La Bomba se juega aquí.</p><div className={styles.facts}><span><b>6</b> Grupos</span><span><b>{snapshot.data.teams.length}</b> Equipos</span><span><b>{snapshot.data.fixtures.length}</b> Partidos</span></div></div>
      </section>
      <div className={`${styles.shell} ${styles.content}`}>
        <CalendarPresentation calendar={calendar} snapshot={snapshot}/>
        <aside className={styles.editorial} aria-label="La pasión del Mundialito"><div><p>LA BOMBA · PETÉN · GUATEMALA</p><h2>El torneo se vive aquí.</h2><span>El fútbol nos reúne. La historia se escribe en la cancha.</span></div></aside>
      </div>
    </div>
  );
}
