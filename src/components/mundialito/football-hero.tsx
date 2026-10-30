import Link from "next/link";
import { getImageProps } from "next/image";
import { ArrowRight, CircleDot, Trophy } from "lucide-react";
import { assetPath } from "@/lib/mundialito/site";
import styles from "./football-hero.module.css";

/** Presentation reserved for Inicio and Grupos; shared heroes stay unchanged. */
export function FootballHero({ compact = false }: { compact?: boolean }) {
  const common = { alt: "", sizes: "100vw", loading: "eager" as const, fetchPriority: "high" as const };
  const { props: desktop } = getImageProps({ ...common, src: assetPath("/images/football-real/field-desktop.webp"), width: 2172, height: 724 });
  const { props: mobile } = getImageProps({ ...common, src: assetPath("/images/football-real/field-mobile.webp"), width: 1000, height: 1250 });
  return <section className={`${styles.root} ${compact ? styles.compact : ""}`} aria-labelledby="hero-title">
    <div className={styles.art} aria-hidden="true"><picture><source media="(max-width:600px)" srcSet={mobile.srcSet} sizes="100vw" /><img {...desktop} alt="" /></picture></div>
    <div className={styles.frame}><div className={styles.copy}>
      <p className={styles.eyebrow}><span />{compact ? "MUNDIALITO LA BOMBA · 2026" : "LA BOMBA · PETÉN · GUATEMALA"}</p>
      <h1 id="hero-title">{compact ? <><span className={styles.overline}>FASE DE</span><span className={styles.gold}>GRUPOS</span></> : <><span className={styles.overline}>MUNDIALITO</span><span className={styles.gold}>LA BOMBA</span><em>2026</em></>}</h1>
      <p className={styles.motto}>FÚTBOL <span>·</span> AMISTAD <span>·</span> PASIÓN</p>
      {!compact && <><p className={styles.description}>Más que fútbol.<br /><strong>Es nuestra pasión.</strong></p><div className={styles.actions}><Link href="/mundialito/partidos" className={styles.primary}><CircleDot size={18} aria-hidden="true" />Ver partidos<ArrowRight size={18} aria-hidden="true" /></Link><Link href="/mundialito/grupos" className={styles.secondary}><Trophy size={18} aria-hidden="true" />Ver grupos</Link></div></>}
    </div></div>
    <div className={styles.stats}><span><strong>6</strong> GRUPOS</span><span><strong>18</strong> EQUIPOS</span><p>UNA MISMA<br />PASIÓN.</p></div>
  </section>;
}
