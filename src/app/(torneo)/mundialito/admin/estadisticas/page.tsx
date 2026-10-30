import Link from "next/link";
import { requireAdministrator } from "@/lib/mundialito/admin/server";
import { readAdminMatches } from "@/lib/mundialito/matches/repository";
import { groupDisciplineLabel } from "@/lib/mundialito/admin/history-presentation";
import { PublicationStatus } from "../statistics-summary";
import styles from "../admin.module.css";
export default async function StatisticsModule() {
  const context=await readAdminMatches(await requireAdministrator(),true);
  const {snapshot}=context,stats=snapshot.statistics;
  const name=(id:string)=>context.data.teams.find(t=>t.slug===id)?.name??id;
  return <section className={styles.dashboard}>
    <h1>Clasificación y estadísticas</h1><p className={styles.hint}>Cálculo central sobre los datos de Supabase. Solo partidos finalizados aportan puntos; las tandas no suman goles.</p>
    <PublicationStatus publication={context.competition.publication}/>
    <p>{context.data.results.filter(r=>r.state==="confirmed").length} resultados finalizados · {context.data.players.length} jugadores · {context.integrity.issues.length} incidencias de calendario.</p>
    <Link href="/mundialito/admin/reglamento" className={styles.secondary}>Revisar integridad y asuntos del Comité</Link>
    <h2>Grupos</h2>
    <div className={styles.reviewGrid}>{snapshot.groups.map(g=><article className={styles.notice} key={g.group}>
      <h3>Grupo {g.group}</h3><p>{g.hasResults?"Orden calculado; sujeto a revisión":"Sin resultados finalizados"}</p>
      <ol>{g.rows.map(r=><li key={r.team.slug}><strong>{r.team.name}</strong><p>{r.stats.points} pts · PJ {r.stats.played} · GF {r.stats.gf} · GC {r.stats.ga} · DG {r.stats.gd} · Disciplina: {groupDisciplineLabel(r.stats)}</p><p>Posición: {r.position??"por resolver"}{r.pending.length?` · ${r.pending.join(", ")}`:""}</p></li>)}</ol>
    </article>)}</div>
    <h2>Mejores terceros</h2>
    {snapshot.thirds.length?<ol>{snapshot.thirds.map(r=><li key={r.team.slug}>{r.team.name}: {r.stats.points} pts · DG {r.stats.gd} · GF {r.stats.gf} · posición {r.position??"pendiente"}</li>)}</ol>:<p className={styles.notice}>Aún no se conocen los seis terceros; no se inventan cuatro clasificados.</p>}
    <h2>Goles registrados</h2>
    <p>{stats.eventComplete?"Cobertura completa del conjunto calculado.":"Registro parcial: no constituye una tabla definitiva de goleadores."} Los autogoles y los lanzamientos de tanda no se atribuyen como goles del jugador.</p>
    {stats.recordedScorers.length?<ol>{stats.recordedScorers.map(r=><li key={r.player.id}>{r.player.name} · {name(r.player.teamId)}: {r.goals} goles</li>)}</ol>:<p>Sin goles individuales computables en partidos finalizados. No se atribuyen automáticamente a partir del marcador.</p>}
    <h2>Tarjetas por jugador</h2>
    {stats.playerRows.filter(r=>r.yellows||r.reds).length?<div className={styles.reviewGrid}>{stats.playerRows.filter(r=>r.yellows||r.reds).map(r=><article key={r.player.id} className={styles.notice}>
      <strong>{r.player.name} · {name(r.player.teamId)}</strong><p>{r.yellows} amarillas · {r.reds} expulsiones · Puntos disciplinarios registrados: {r.observedDiscipline??"causa de expulsión por aclarar"}. Cómputo provisional.</p>
      <p>Las consecuencias se revisan en Control reglamentario; esta vista no impone sanciones.</p>
    </article>)}</div>:<p>Sin tarjetas registradas en partidos finalizados. Los encuentros sin revisión explícita permanecen pendientes.</p>}
    <h2>Disciplina para desempate de grupos</h2>
    <ul>{snapshot.groups.flatMap(g=>g.rows).map(r=><li key={r.team.slug}>{r.team.name}: {groupDisciplineLabel(r.stats)}. Solo fase de grupos.</li>)}</ul>
    <h2>Proyección de eliminatorias</h2><div className={styles.reviewGrid}>{context.competition.operations.map(o=><article className={styles.notice} key={o.matchId}><strong>{o.matchId}</strong><p>{o.projection.home.teamId?name(o.projection.home.teamId):o.projection.home.label} VS {o.projection.away.teamId?name(o.projection.away.teamId):o.projection.away.label}</p><p>{o.state==="ready"?"Apta según evidencia local":"Proyección: pendiente de revisión y aprobación"}</p></article>)}</div>
  </section>;
}
