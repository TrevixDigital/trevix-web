import type { ClassificationPublication } from "@/lib/mundialito/domain/governance";
import styles from "./admin.module.css";
const labels:Record<string,string>={results_pending:"Faltan resultados finalizados",ranking_pending:"Criterios de clasificación pendientes",certification_pending:"Revisión de goles o tarjetas pendiente",protests_unverified:"Registro de protestas sin verificar",protest_pending:"Protesta sin resolución notificada",approval_missing:"Confirmación deportiva pendiente",approval_stale:"Confirmación desactualizada"};
export function PublicationStatus({publication}:{publication:ClassificationPublication}) {
  return <aside className={styles.notice} aria-label="Estado de publicación"><h2>{publication.status==="official"?"Clasificación oficial":publication.status==="provisional"?"Clasificación provisional":"Clasificación pendiente de resultados"}</h2>
    <p>La confirmación deportiva requiere todos los resultados y desempates resueltos. No activa la certificación técnica de actas.</p>
    <ul>{publication.blockers.map(b=><li key={b}>{labels[b]}</li>)}</ul>
  </aside>;
}
