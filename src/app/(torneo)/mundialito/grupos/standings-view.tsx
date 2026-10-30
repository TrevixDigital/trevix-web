import Link from "next/link";
import type { getCompetitionReport } from "@/lib/mundialito/repositories/tournament";
import type { PendingReason, RankedTeam } from "@/lib/mundialito/domain/types";
import styles from "./groups.module.css";

export type GroupsReport = Awaited<ReturnType<typeof getCompetitionReport>>;
const reasons: Record<PendingReason, string> = {
  results: "Partidos por disputar", discipline: "Tarjetas por revisar", draw: "Sorteo documentado requerido",
  interpretation: "Interpretación pendiente del Comité", assignment: "Asignación de terceros pendiente", penalties: "Penales por resolver",
};
const columns = [["played","PJ","Partidos jugados"],["won","G","Ganados"],["drawn","E","Empatados"],["lost","P","Perdidos"],["gf","GF","Goles a favor"],["ga","GC","Goles en contra"],["gd","DG","Diferencia de goles"],["points","PTS","Puntos"]] as const;
const discipline = (row: RankedTeam) => row.stats.discipline ?? row.stats.provisionalDiscipline ?? null;
const signed = (n: number) => n > 0 ? `+${n}` : n;

export function GroupTables({ report }: { report: GroupsReport }) {
  const snapshot = report.calculation;
  return <div className={styles.grid}>{snapshot.groups.map(group => {
    const played = snapshot.data.results.filter(r => r.state === "confirmed" && snapshot.data.fixtures.some(f => f.id === r.matchId && f.stage === "groups" && f.group === group.group)).length;
    const pending = [...new Set(group.rows.flatMap(row => row.pending))].filter(r => r !== "results");
    return <article key={group.group} id={`grupo-${group.group.toLowerCase()}`} className={`${styles.card} group-${group.group.toLowerCase()}`}>
      <header className={styles.cardHeader}>
        <h3><span>GRUPO</span><strong>{group.group}</strong></h3>
        <div className={styles.cardMeta}><span>03 EQUIPOS</span><b>{played}<span> / 3 partidos</span></b></div>
        <span className={styles.watermark} aria-hidden="true">{group.group}</span>
      </header>
      <div className={styles.scroll} tabIndex={0} role="region" aria-label={`Clasificación del grupo ${group.group}. Desplaza para consultar todas las estadísticas.`}>
        <table className={styles.groupTable}>
          <caption className="sr-only">Grupo {group.group}. {report.publication.status === "official" ? "Clasificación deportiva confirmada" : "Posiciones provisionales; los empates sin resolver no tienen posición asignada"}.</caption>
          <colgroup><col className={styles.positionCol}/><col className={styles.teamCol}/>{columns.map(([key])=><col key={key}/>)}</colgroup>
          <thead><tr><th scope="col">POS</th><th scope="col">EQUIPO</th>{columns.map(([,label,title])=><th key={label} scope="col"><abbr title={title}>{label}</abbr></th>)}</tr></thead>
          <tbody>{group.rows.map(row => <tr key={row.team.slug} className={group.hasResults && row.possiblePositions.length > 0 && row.possiblePositions.every(p => p <= 2) ? styles.directRow : undefined}>
            <td><span className={styles.position}>{row.position ?? "—"}</span></td>
            <th scope="row"><Link href={`/mundialito/equipos/${row.team.slug}`}>{row.team.name}</Link></th>
            {columns.map(([key])=><td key={key} className={key === "points" ? styles.points : undefined}>{group.hasResults ? key === "gd" ? signed(row.stats[key]) : row.stats[key] : "—"}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
      <footer className={styles.cardFooter}><span className={styles.progressLabel}>{group.complete ? "Grupo completado" : group.hasResults ? "En disputa" : "Sin disputar"}</span><span>2 plazas directas</span>
        {pending.length > 0 && <p className={styles.pending}>{pending.map(p => reasons[p]).join(" · ")}</p>}
      </footer>
    </article>;
  })}</div>;
}

/** This is a view of the engine output, never a new ranking or a tie resolution. */
export function ThirdsStandings({ report }: { report: GroupsReport }) {
  const snapshot = report.calculation;
  const ranked = snapshot.thirds.length > 0;
  const rows = ranked ? snapshot.thirds.map(row => ({ key: row.team.slug, group: row.team.group, row })) : snapshot.thirdCandidates.map(candidate => ({ key: candidate.group, group: candidate.group, row: candidate.rows.find(row => row.position === 3) ?? null }));
  return <section className={styles.thirds} aria-labelledby="thirds-heading">
    <header className={styles.sectionHeader}><div><p className={styles.eyebrow}>EL ÚLTIMO BOLETO A OCTAVOS</p><h2 id="thirds-heading">Los cuatro mejores terceros</h2><p>Seis grupos. Cuatro plazas. Una misma tabla.</p></div><div className={styles.spots}><strong>04</strong><span>PLAZAS<br/>EN JUEGO</span></div></header>
    <p className={styles.thirdsContext}>{ranked ? report.publication.status === "official" ? "Orden deportivo confirmado." : "Comparación provisional de los terceros actuales; los puestos pueden cambiar." : "La comparación se completará cuando los seis grupos tengan un tercer puesto resuelto. Los equipos identificados se muestran como referencia provisional."}</p>
    <div className={styles.scroll} tabIndex={0} role="region" aria-label="Mejores terceros. Desplaza para consultar las diez columnas.">
      <table className={styles.thirdsTable}>
        <caption className="sr-only">Ranking de terceros. Orden: puntos, diferencia de goles, goles a favor, disciplina y sorteo documentado. Sin enfrentamiento directo entre grupos.</caption>
        <colgroup><col className={styles.positionCol}/><col className={styles.thirdTeamCol}/><col className={styles.groupCol}/>{Array.from({length:6},(_,i)=><col key={i}/>)}<col className={styles.situationCol}/></colgroup>
        <thead><tr>{["POS","EQUIPO","GRUPO","PJ","GF","GC","DG","PTS","DISC.","SITUACIÓN"].map(label=><th scope="col" key={label}>{label === "DISC." ? <abbr title="Puntos disciplinarios registrados; menos es mejor">DISC.</abbr> : label}</th>)}</tr></thead>
        <tbody>{rows.map(({key,group,row}) => {
          const currentGroup = snapshot.groups.find(g => g.group === group)!;
          const projected = ranked && row && row.possiblePositions.length > 0 && row.possiblePositions.every(p => p <= 4);
          const outside = ranked && row && row.possiblePositions.length > 0 && row.possiblePositions.every(p => p > 4);
          const pending = ranked && row ? row.pending.filter(p => p !== "results") : currentGroup.rows.flatMap(r => r.pending).filter(p => p !== "results");
          const situation = !row ? currentGroup.hasResults ? "Tercero por resolver" : "Grupo sin disputar" : !ranked ? "3.º provisional" : projected ? report.publication.status === "official" ? "Clasificado" : "En proyección" : outside ? "Fuera de los cuatro" : "Corte por resolver";
          return <tr key={key} className={`${projected ? styles.projectedRow : ""} group-${group.toLowerCase()}`}>
            <td><span className={styles.position}>{ranked ? row?.position ?? "—" : "—"}</span></td>
            <th scope="row">{row ? <Link href={`/mundialito/equipos/${row.team.slug}`}>{row.team.name}</Link> : <span className={styles.unknownTeam}>Por definir</span>}</th>
            <td><span className={styles.groupTag}>{group}</span></td>
            <td>{row && currentGroup.hasResults ? row.stats.played : "—"}</td>
            <td>{row && currentGroup.hasResults ? row.stats.gf : "—"}</td>
            <td>{row && currentGroup.hasResults ? row.stats.ga : "—"}</td>
            <td>{row && currentGroup.hasResults ? signed(row.stats.gd) : "—"}</td>
            <td className={styles.points}>{row && currentGroup.hasResults ? row.stats.points : "—"}</td>
            <td title={row && discipline(row) === null ? "Revisión disciplinaria insuficiente" : undefined}>{row && currentGroup.hasResults ? discipline(row) ?? "—" : "—"}</td>
            <td className={styles.situation}><span className={projected ? styles.inProjection : undefined}>{situation}</span>{pending.length > 0 && <small>{[...new Set(pending)].map(p=>reasons[p]).join(" · ")}</small>}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <footer className={styles.thirdsFooter}><p><span>ORDEN DE CLASIFICACIÓN</span> Puntos <i>→</i> DG <i>→</i> GF <i>→</i> Disciplina <i>→</i> Sorteo documentado</p><p>Sin duelo directo entre grupos. Un guion indica una posición o un dato aún sin resolver.</p></footer>
  </section>;
}
