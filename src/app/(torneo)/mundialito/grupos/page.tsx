import { FootballHero } from "@/components/mundialito/football-hero";
import { MatchList } from "@/components/mundialito/match-list";
import { getCompetitionReport } from "@/lib/mundialito/repositories/tournament";
import { GroupTables, ThirdsStandings } from "./standings-view";
import styles from "./groups.module.css";
import type { CSSProperties } from "react";
import { assetPath } from "@/lib/mundialito/site";
export const metadata = { title: "Grupos" };
export default async function Page() {
  const report = await getCompetitionReport();
  const finished = report.calculation.data.results.filter(r => r.state === "confirmed" && report.calculation.data.fixtures.some(f => f.id === r.matchId && f.stage === "groups")).length;
  return (
    <div className={styles.page} style={{ "--groups-atmosphere": `url("${assetPath("/images/football-real/field-desktop.webp")}")` } as CSSProperties}>
      <FootballHero compact />
      <section className={styles.content}>
        <header className={styles.intro}><div><p className={styles.eyebrow}>MUNDIALITO LA BOMBA · 2026</p><h2>Seis grupos.<br/><em>Un mismo sueño.</em></h2><p className={styles.introCopy}>La primera etapa del camino a la copa. Sigue a los 18 equipos y su lucha por un lugar en los octavos de final.</p></div><div className={styles.format} aria-label="Formato del torneo"><div><strong>06</strong><span>GRUPOS</span></div><div><strong>18</strong><span>EQUIPOS</span></div><div><strong>16</strong><span>CLASIFICAN</span></div></div></header>
        <div className={styles.contextBar}><span><strong>{report.publication.status === "official" ? "Clasificación confirmada" : "Clasificación provisional"}</strong>{finished} de 18 partidos finalizados</span><span>Avanzan los dos primeros de cada grupo y los cuatro mejores terceros.</span></div>
        <GroupTables report={report}/>
        <p className={styles.scrollHint}>Desliza las tablas para consultar todas las estadísticas. Las posiciones sin resolver se muestran con un guion.</p>
        <ThirdsStandings report={report}/>
        <section className={styles.results}>
          <header className={styles.sectionHeader}><div><p className={styles.eyebrow}>EL TORNEO, PARTIDO A PARTIDO</p><h2>Resultados por grupo</h2><p>Solo encuentros finalizados con marcador registrado.</p></div></header>
          <MatchList groupOnly mode="results" />
        </section>
        <p className={styles.finalNote}>Los resultados publicados actualizan estas tablas automáticamente. Los sorteos y las interpretaciones pendientes requieren una decisión documentada del Comité; una proyección no equivale a una clasificación definitiva.</p>
      </section>
    </div>
  );
}
