import type { CSSProperties } from "react";
import { getImageProps } from "next/image";
import { getTournament } from "@/lib/mundialito/repositories/tournament";
import { assetPath } from "@/lib/mundialito/site";
import { TeamGallery } from "./team-gallery";
import styles from "./teams.module.css";
export const metadata = { title: "Equipos oficiales" };
export default async function Page() {
  const snapshot=await getTournament();
  const {props:desktop}=getImageProps({src:assetPath("/images/teams/teams-peten-original.webp"),width:2100,height:788,alt:"",sizes:"100vw",loading:"eager",fetchPriority:"high"});
  const {props:mobile}=getImageProps({src:assetPath("/images/teams/teams-peten-mobile.webp"),width:900,height:1000,alt:"",sizes:"100vw",loading:"eager",fetchPriority:"high"});
  const art={"--teams-forest":`url("${assetPath("/images/matches/peten-dusk-background.webp")}")`,"--teams-texture":`url("${assetPath("/images/teams/football-grain-original.webp")}")`} as CSSProperties;
  return <div className={styles.page} style={art}>
    <section className={styles.hero} aria-labelledby="teams-title"><div className={styles.heroArt} aria-hidden="true"><picture><source media="(max-width:600px)" srcSet={mobile.srcSet} sizes="100vw"/><img {...desktop} alt=""/></picture></div>
      <div className={`${styles.shell} ${styles.heroContent}`}><p className={styles.eyebrow}>LOS PROTAGONISTAS · MUNDIALITO 2026</p><h1 id="teams-title">18 EQUIPOS.<span>UNA MISMA PASIÓN.</span></h1><p className={styles.heroCopy}>Conoce a los clubes que dan vida al Mundialito La Bomba.</p></div>
    </section>
    <div className={`${styles.shell} ${styles.content}`}><TeamGallery snapshot={snapshot}/></div>
  </div>;
}
