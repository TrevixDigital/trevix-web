import type { CSSProperties } from "react";
import { getImageProps } from "next/image";
import { getCalendar, getCompetitionReport } from "@/lib/mundialito/repositories/tournament";
import { assetPath } from "@/lib/mundialito/site";
import { FinalsPresentation } from "./finals-presentation";
import styles from "./finals.module.css";
export const metadata = { title: "Fase final" };
export default async function Page() {
  const [report,calendar] = await Promise.all([getCompetitionReport(),getCalendar()]);
  const {props:desktop}=getImageProps({src:assetPath("/images/finals/road-to-glory-original.webp"),width:2100,height:788,alt:"",sizes:"100vw",loading:"eager",fetchPriority:"high"});
  const {props:mobile}=getImageProps({src:assetPath("/images/finals/road-to-glory-mobile.webp"),width:900,height:1000,alt:"",sizes:"100vw",loading:"eager",fetchPriority:"high"});
  return <div className={styles.page} style={{"--finals-forest":`url("${assetPath("/images/matches/peten-dusk-background.webp")}")`} as CSSProperties}>
    <section className={styles.hero} aria-labelledby="finals-title">
      <div className={styles.heroArt} aria-hidden="true"><picture><source media="(max-width:600px)" srcSet={mobile.srcSet} sizes="100vw"/><img {...desktop} alt=""/></picture></div>
      <div className={`${styles.shell} ${styles.heroContent}`}><p className={styles.eyebrow}>MUNDIALITO LA BOMBA · 2026</p><h1 id="finals-title">FASE <span>FINAL</span></h1><p className={styles.heroCopy}>Rumbo a la gloria.</p><div className={styles.heroMeta}>Cuartos · Semifinales · Gran final</div></div>
    </section>
    <div className={`${styles.shell} ${styles.content}`}><FinalsPresentation report={report} calendar={calendar}/></div>
  </div>;
}
