import type { summarizeActa } from "@/lib/mundialito/events/acta-summary";
import styles from "../admin.module.css";
export function ActaSummaryPanel({summary,readable,cardsWritable,certificationWritable}:{summary:ReturnType<typeof summarizeActa>;readable:boolean;cardsWritable:boolean;certificationWritable:boolean}) {
  return <section className={styles.notice} aria-label="Resumen de integridad del acta">
    <h2>Resumen del acta guardada</h2><p>{summary.message}</p>
    <p>Goles asignados: {summary.homeGoals} – {summary.awayGoals} · autogoles: {summary.ownGoals} · amarillas: {summary.yellows} · expulsiones: {summary.reds}.</p>
    <p>1. Guarda marcador/estado. 2. Asigna goles y autogoles. 3. Revisa tarjetas por jugador. Cada sección confirma su propio guardado; no es un envío único atómico.</p>
    {!readable&&<p>Lectura detallada de tarjetas desactivada por configuración. El registro de goles no depende de habilitar certificación.</p>}
    {!cardsWritable&&<p>Guardado de tarjetas desactivado. Su RPC ya pertenece a revisión 4; no requiere la certificación v2.</p>}
    {!certificationWritable&&<p>Certificación desactivada; esto no impide preparar y registrar los hechos en las secciones autorizadas.</p>}
  </section>;
}
