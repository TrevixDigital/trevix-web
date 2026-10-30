import type { AuditEntry } from "@/lib/mundialito/admin/regulatory-read";
import { historyChange, historyDate, historyHeading, type HistoryNames } from "@/lib/mundialito/admin/history-presentation";
import styles from "../admin.module.css";
export function HistoryPanel({entries,error,teams,players}:{entries:AuditEntry[];error:string}&HistoryNames) {
  return <details className={styles.actaSection} id="historial-acta"><summary>5. Historial y responsables</summary>
    <p className={styles.hint}>Horario de Guatemala. Los nombres corresponden a las nóminas disponibles. El responsable conserva su UID; no se consultan cuentas ni correos privados.</p>
    {error?<p role="alert" className={styles.notice}>{error}</p>:!entries.length?<p>Sin entradas de auditoría disponibles para este encuentro.</p>:entries.map(e=><article key={`${e.entity}:${e.id}`} className={styles.notice}>
      <strong>{historyHeading(e)}</strong><p>{historyDate(e.at)}</p>
      <p className={styles.auditId}>Responsable: {e.actorId}</p>
      {e.changes.map(c=>{const text=historyChange(c,{teams,players});return text?<p key={c.field}>{text}</p>:null;})}
      {!e.changes.some(c=>historyChange(c,{teams,players}))&&<p>Sin diferencias en los campos deportivos de esta vista.</p>}
    </article>)}
  </details>;
}
