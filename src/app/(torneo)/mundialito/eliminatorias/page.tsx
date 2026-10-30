import type { CSSProperties } from "react";
import { getImageProps } from "next/image";
import { getCalendar, getCompetitionReport } from "@/lib/mundialito/repositories/tournament";
import { assetPath } from "@/lib/mundialito/site";
import { KnockoutPresentation } from "./knockout-presentation";
import styles from "./knockout.module.css";
export const metadata = { title: "Eliminatorias" };
export default async function Page() {
  const [report, calendar] = await Promise.all([getCompetitionReport(), getCalendar()]);
  const { props: desktop } = getImageProps({ src: assetPath("/images/knockout/tikal-trophy-original.webp"), width: 2100, height: 788, alt: "", sizes: "100vw", loading: "eager", fetchPriority: "high" });
  const { props: mobile } = getImageProps({ src: assetPath("/images/knockout/tikal-trophy-mobile.webp"), width: 900, height: 1000, alt: "", sizes: "100vw", loading: "eager", fetchPriority: "high" });
  const art = { "--knockout-forest": `url("${assetPath("/images/matches/peten-dusk-background.webp")}")` } as CSSProperties;
  return <div className={styles.page} style={art}>
    <section className={styles.hero} aria-labelledby="knockout-title">
      <div className={styles.heroArt} aria-hidden="true"><picture><source media="(max-width: 600px)" srcSet={mobile.srcSet} sizes="100vw"/><img {...desktop} alt=""/></picture></div>
      <div className={`${styles.shell} ${styles.heroContent}`}>
        <p className={styles.eyebrow}>MUNDIALITO LA BOMBA · 2026</p>
        <h1 id="knockout-title">ELIMINA<span>TORIAS</span></h1>
        <p className={styles.heroCopy}>El camino hacia la gloria.</p>
        <div className={styles.heroMeta}><span>Octavos de final</span><i aria-hidden="true"/><span>Cuartos de final</span></div>
      </div>
    </section>
    <div className={`${styles.shell} ${styles.content}`}><KnockoutPresentation report={report} calendar={calendar}/></div>
  </div>;
}
