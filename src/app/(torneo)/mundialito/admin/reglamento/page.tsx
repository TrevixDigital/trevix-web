import Link from "next/link";
import { requireAdministrator } from "@/lib/mundialito/admin/server";
import { groupDisciplineLabel } from "@/lib/mundialito/admin/history-presentation";
import { readAdminMatches } from "@/lib/mundialito/matches/repository";
import { knockoutSyncPlan } from "@/lib/mundialito/matches/sync";
import {
  regulatoryReview,
  groupDiscipline,
  suspensionWarnings,
} from "@/lib/mundialito/engine/regulatory";
import styles from "../admin.module.css";
import { readDecisionRegister } from "@/lib/mundialito/admin/regulatory-read";
import { PublicationStatus } from "../statistics-summary";
import { disciplinaryObligations } from "@/lib/mundialito/engine/disciplinary-obligations";
import { randomUUID } from "node:crypto";
import { ClassificationForm } from "./classification-form";
import { recordDrawAction, publishClassificationAction } from "./classification-actions";
import { classificationWritesEnabled } from "@/lib/mundialito/matches/classification-admin";
export const metadata = { title: "Control reglamentario · Administración" };
export default async function RegulatoryPage() {
  const client=await requireAdministrator();
  const context = await readAdminMatches(client, true),
    review = regulatoryReview(context.snapshot),
    sync = knockoutSyncPlan(context),
    discipline = groupDiscipline(context.data);
  const obligations=disciplinaryObligations(context.data);
  let decisions:Awaited<ReturnType<typeof readDecisionRegister>>=[],decisionError="";
  try{decisions=await readDecisionRegister(client,context.metadata.tournament.id);}
  catch{decisionError="No se pudo leer el registro de decisiones. No se supondrá que no existen protestas o resoluciones.";}
  const alerts = suspensionWarnings(
    context.data,
    context.metadata.matches.map((m) => {
      const f = context.data.fixtures.find((f) => f.id === m.localId)!,
        b = context.snapshot.bracket.find((b) => b.id === m.localId);
      return {
        id: m.localId,
        homeTeamId: b?.state === "confirmed" ? b.home.teamId : f.homeTeamId,
        awayTeamId: b?.state === "confirmed" ? b.away.teamId : f.awayTeamId,
        startsAt: f.startsAt,
        status: m.status,
      };
    }),
  );
  const name = (id: string) =>
    context.data.teams.find((t) => t.slug === id)?.name ?? id;
  return (
    <section className={styles.dashboard}>
      <Link href="/mundialito/admin" className={styles.backLink}>
        ← Resumen
      </Link>
      <h1>Control reglamentario</h1>
      <h2>Clasificación y octavos</h2>
      <p className={styles.hint}>Clasifican los dos primeros de cada grupo y los cuatro mejores terceros. Para confirmar: 18 partidos finalizados, desempates resueltos y asignación del artículo 12 válida. No se exige certificación técnica.</p>
      <PublicationStatus publication={context.competition.publication}/>
      {context.classification&&<>
        {context.classification.issues.map(i=><p role="alert" className={styles.notice} key={i.id}>{i.reason} Si cambió un resultado, revisa los sorteos y los cruces registrados.</p>)}
        {context.classification.requests.length===0?<p>Sin sorteos habilitados con los datos actuales. Los empates que aún dependan de resultados, tarjetas o interpretación siguen pendientes.</p>:context.classification.requests.map(r=><article key={r.basis} className={styles.notice}>
          <h3>{r.kind==="draw"?`Registrar sorteo · ${r.scope.startsWith("group:")?`Grupo ${r.scope.slice(6)}`:r.scope==="thirds"?"Mejores terceros":"Líderes de A–D"}`:"Sorteo de asignación de terceros"}</h3>
          <p>Registra únicamente el resultado de un sorteo documentado ya realizado. El sistema no elige al azar.</p>
          <ClassificationForm save={recordDrawAction.bind(null,{...r,id:randomUUID()})} enabled={classificationWritesEnabled()} teams={r.kind==="draw"?r.teams.map(id=>({id,name:name(id)})):[]}
            alternatives={r.kind==="third_assignment"?r.alternatives.map(a=>({label:["A","B","C","D"].map(g=>`1${g} vs. ${name(a[g])}`).join(" · ")})):undefined}/>
        </article>)}
        <h3>{context.classification.circuit.ready?"Clasificados calculados · listos para confirmar":"Proyección de clasificados"}</h3>
        <ul>{context.classification.circuit.qualifiers.map(r=><li key={r.team.slug}>{r.team.name} · Grupo {r.team.group}</li>)}</ul>
        {context.classification.circuit.octavos.map(m=><p key={m.id}><strong>{m.id}</strong>: {m.home.teamId?name(m.home.teamId):m.home.label} VS {m.away.teamId?name(m.away.teamId):m.away.label}</p>)}
        {sync.conflicts.length>0&&<p role="alert" className={styles.notice}>Los cruces registrados no coinciden con el nuevo cálculo: {sync.conflicts.join(", ")}. No se reemplazarán equipos ni resultados silenciosamente.</p>}
        {context.competition.publication.status!=="official"&&<ClassificationForm save={publishClassificationAction.bind(null,{id:randomUUID(),basis:context.classification.confirmationBasis})} teams={[]} publish enabled={classificationWritesEnabled()&&context.classification.circuit.ready&&!sync.conflicts.some(id=>id.startsWith("O"))}
          blockedReason={!classificationWritesEnabled()?"La publicación está preparada; falta autorizar su activación en este entorno.":!context.classification.circuit.ready?"Aún faltan partidos, datos disciplinarios o desempates para confirmar los 16 clasificados.":"Hay cruces registrados que requieren revisión antes de publicar otra asignación."}/>}
      </>}
      <details className={styles.actaSection}>
      <summary>Información reglamentaria de consulta</summary>
      <p className={styles.notice}>
        El administrador registra hechos; el motor calcula. No hay sorteos
        aleatorios, sanciones discrecionales automáticas ni modificaciones de
        equipos. Los Cerritos corresponde al equipo vigente 2.da Del Sagrado; se
        mantienen sus IDs y relaciones.
      </p>
      <h2>Actas y disciplina</h2>
      <PublicationStatus publication={context.competition.publication}/>
      <h2>Integridad del calendario</h2>
      <p>{context.records.length} partidos leídos del torneo oficial. O7: 2A vs. 2D. O8: 2B vs. 2C.</p>
      {context.integrity.issues.length?context.integrity.issues.map((issue,i)=><p className={styles.notice} key={`${issue.matchId}:${issue.code}:${i}`}>
        Partido {issue.number}: {issue.message} {issue.matchId&&<Link href={`/mundialito/admin/partidos/${issue.matchId}/editar`}>Revisar acta</Link>}
      </p>):<p>Sin incidencias detectadas por las validaciones del calendario.</p>}
      <p className={styles.notice}>
        La revisión 4 está instalada. La disponibilidad de lectura y las
        autorizaciones para nuevas escrituras se comprueban por separado.
        Ausencia de eventos no significa cero tarjetas confirmado. La
        certificación se revisa en el acta de cada partido.
      </p>
      {review.groups.map((g) => (
        <article key={g.group} className={styles.notice}>
          <h3>Grupo {g.group}</h3>
          <p>
            {g.complete
              ? "Resultados de grupos completos"
              : "Partidos pendientes: posiciones provisionales"}
            .{" "}
            {g.pending.length
              ? `Pendiente: ${g.pending.join(", ")}`
              : "Criterios deportivos resueltos."}
          </p>
          {discipline
            .filter(
              (d) =>
                context.data.teams.find((t) => t.slug === d.teamId)!.group ===
                g.group,
            )
            .map((d) => (
              <p key={d.teamId}>
                {name(d.teamId)}: amarillas registradas {d.observed.yellows};
                rojas registradas {d.observed.reds}; disciplina para desempate:{" "}
                {groupDisciplineLabel(context.snapshot.groups.flatMap(group=>group.rows).find(row=>row.team.slug===d.teamId)?.stats??{discipline:null})}.
              </p>
            ))}
        </article>
      ))}
      <h2>Sorteos que realmente se requieren</h2>
      {review.draws.length ? (
        review.draws.map((d) => (
          <article className={styles.notice} key={d.basis}>
            <strong>{d.context}</strong>
            <p>{d.teamIds.map(name).join(" · ")}</p>
            <p>{d.criteria}</p>
            <p>
              El esquema de decisiones está instalado. Su formulario y
              autorización de escritura siguen pendientes; no se admite cambiar
              posiciones resueltas sin una resolución oficial vigente.
            </p>
          </article>
        ))
      ) : (
        <p className={styles.notice}>
          No hay un sorteo habilitable con los datos completos actuales. Primero
          deben completarse resultados, actas o interpretaciones pendientes; no
          se pide un sorteo anticipado.
        </p>
      )}
      <h2>Cruces automáticos</h2>
      <p>
        {sync.pending} llaves pendientes de participantes confirmados.{" "}
        {sync.changes.length} tienen candidatos calculados. Son proyecciones;
        su guardado permanece bloqueado sin aprobación y revisión reglamentaria.{" "}
        {sync.conflicts.length > 0
          ? `Revisión de participantes existentes: ${sync.conflicts.join(", ")}.`
          : "No se sobrescriben participantes ni resultados existentes."}
      </p>
      {review.assignmentDraw && (
        <p className={styles.notice}>
          Varias asignaciones tienen igual prioridad: requiere sorteo
          documentado del Comité.
        </p>
      )}
      <h2>Registro de decisiones del Comité</h2>
      <p className={styles.hint}>Solo lectura. Una fila no se aplica automáticamente como sanción, resolución de protesta o aprobación de clasificación: falta validar su contexto y notificación.</p>
      {decisionError?<p role="alert" className={styles.notice}>{decisionError}</p>:!decisions.length?<p>Sin decisiones en esta lectura. Esto no certifica ausencia de protestas fuera del sistema.</p>:decisions.map(d=><article className={styles.notice} key={String(d.id)}>
        <strong>{String(d.kind)} · {d.current?"Sin sustitución registrada":"Sustituida"}</strong>
        <p>{String(d.reason)} · Artículo {String(d.article_reference)}</p><p>Documento: {String(d.document_reference)}</p>
        <p className={styles.auditId}>Responsable: {String(d.recorded_by)} · {String(d.recorded_at)}</p>
      </article>)}
      <p className={styles.notice}>Multas, pagos y cumplimiento de sanciones: falta un contrato verificado de persistencia. No se simulan guardados ni se imponen sanciones discrecionales.</p>
      <h2>Advertencias de elegibilidad</h2>
      <h3>Consecuencias calculadas de tarjetas</h3>
      <p className={styles.hint}>Artículos 23–25: Q10 por amarilla; Q20 en total por doble amarilla; Q30 por roja sin agresión solo tras calificación documentada. No se registra deuda, pago ni cumplimiento automáticamente.</p>
      {obligations.map(o=><article className={styles.notice} key={`${o.playerId}:${o.matchId}`}>
        <strong>{context.data.players.find(p=>p.id===o.playerId)?.name} · {o.matchId}</strong>
        <p>{o.yellows} amarillas · {o.reds} expulsiones · disciplina {o.points??"pendiente"}</p>
        <p>Multa calculable: {o.totalQuetzales===null?"pendiente":`Q${o.totalQuetzales}`} · suspensión {o.suspensionMatches===null?"pendiente":`${o.suspensionMatches} partido siguiente del equipo`}.</p>
        <p>{o.note} Pago: sin constancia disponible.</p>
      </article>)}
      {alerts.length ? (
        alerts.map((a) => (
          <article
            className={styles.notice}
            key={`${a.playerId}:${a.sourceMatchId}`}
          >
            <p>
              {context.data.players.find((p) => p.id === a.playerId)?.name} ·{" "}
              {name(a.teamId)} · artículo {a.article}
            </p>
            <p>{a.reason}</p>
            <p>
              {a.requiresCommittee
                ? "Calificación o sanción pendiente del Comité."
                : a.nextMatchId
                  ? `Revisar habilitación para ${a.nextMatchId}.`
                  : "El próximo encuentro no está inequívocamente definido."}{" "}
              No se impone derrota ni inhabilitación permanente.
            </p>
          </article>
        ))
      ) : (
        <p className={styles.notice}>
          Sin advertencias deducibles de los eventos oficiales registrados; esto
          no sustituye una certificación de acta.
        </p>
      )}
      <Link href="/mundialito/admin/partidos" className={styles.primary}>
        Volver a partidos y eventos
      </Link>
      </details>
    </section>
  );
}
