import type { CSSProperties } from "react";
import { getImageProps } from "next/image";
import { getTournament } from "@/lib/mundialito/repositories/tournament";
import { assetPath } from "@/lib/mundialito/site";
import { StatisticsTabs } from "./statistics-tabs";
import { StatisticsPanels } from "./statistics-panels";
import styles from "./statistics.module.css";
export const metadata={title:"Estadísticas"};
export default async function Page(){const snapshot=await getTournament(),panels=StatisticsPanels({snapshot});const{props:desktop}=getImageProps({src:assetPath("/images/statistics/tournament-numbers-original.webp"),width:2100,height:788,alt:"",sizes:"100vw",loading:"eager",fetchPriority:"high"});const{props:mobile}=getImageProps({src:assetPath("/images/statistics/tournament-numbers-mobile.webp"),width:900,height:1000,alt:"",sizes:"100vw",loading:"eager",fetchPriority:"high"});return <div className={styles.page} style={{"--statistics-forest":`url("${assetPath("/images/matches/peten-dusk-background.webp")}")`} as CSSProperties}><section className={styles.hero} aria-labelledby="statistics-title"><div className={styles.heroArt} aria-hidden="true"><picture><source media="(max-width:600px)" srcSet={mobile.srcSet} sizes="100vw"/><img {...desktop} alt=""/></picture></div><div className={`${styles.shell} ${styles.heroContent}`}><p className={styles.eyebrow}>EL TORNEO EN NÚMEROS</p><h1 id="statistics-title">ESTADÍS<span>TICAS</span></h1><p>Goleadores, equipos y disciplina. La historia detrás de cada cifra.</p></div></section><div className={`${styles.shell} ${styles.content}`}><StatisticsTabs panels={panels}/></div></div>;}
