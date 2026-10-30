"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { certifyReviewAction, type ReviewFormState } from "./review-actions";
import type { MatchReview, ReviewScope, CertificationSnapshot } from "@/lib/mundialito/events/reviews";
import styles from "../admin.module.css";

export interface ReviewPanelProps extends ReviewScope {
  review: MatchReview | null; available: boolean; readEnabled: boolean;
  writable: boolean; finished: boolean; error?: string;
  snapshot?: CertificationSnapshot; names?: Record<string,string>; teamNames?: Record<string,string>;
}
export function ReviewPanel(props: ReviewPanelProps) {
  const { review, available, readEnabled, writable, finished } = props;
  const router = useRouter();
  const [goals, setGoals] = useState(review?.goals_complete ?? false);
  const [cards, setCards] = useState(review?.cards_complete ?? false);
  const [confirmed, setConfirmed] = useState(false);
  const [state, action, pending] = useActionState(certifyReviewAction.bind(null, {
    matchId: props.matchId, tournamentId: props.tournamentId, version: review?.updated_at ?? null, basis: props.snapshot?.basis,
  }), { error: "" } as ReviewFormState);
  useEffect(() => { if (state.saved) router.refresh(); }, [state.saved, router]);
  const snapshotFinished = props.snapshot?.match.status === "finished" &&
    props.snapshot.match.home_score !== null && props.snapshot.match.away_score !== null &&
    !!props.snapshot.match.home_team_id && !!props.snapshot.match.away_team_id;
  const enabled = available && readEnabled && writable && finished && !!props.snapshot && snapshotFinished;
  const status = (kind: "goals" | "cards") => !available || !readEnabled ? "Sin verificar" :
    review?.[`${kind}_complete`] ? "Certificada" : review?.[`${kind}_reference`] ? "Pendiente de nueva revisión" : "Pendiente";
  return <section id="revision-acta" className={styles.actaSection} aria-labelledby="review-title">
    <h2 id="review-title">Revisión y certificación del acta</h2>
    <p className={styles.hint}>Registrado: información guardada del encuentro. Pendiente: revisión aún no confirmada. Certificada: revisión confirmada por un administrador. Un marcador finalizado no significa que todas las secciones estén certificadas.</p>
    <div className={styles.reviewGrid}>
      {(["goals", "cards"] as const).map(kind => <article className={styles.reviewStatus} key={kind}>
        <h3>{kind === "goals" ? "Goles" : "Tarjetas"}</h3>
        <strong>{status(kind)}</strong>
        {review?.[`${kind}_confirmed_at`] && <p>Confirmada: {new Intl.DateTimeFormat("es-GT", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Guatemala" }).format(new Date(review[`${kind}_confirmed_at`]!))}</p>}
      </article>)}
    </div>
    <p className={styles.hint}>{available ? "Esquema de actas disponible." : "No se confirmó la disponibilidad del esquema de actas."} {readEnabled ? "Lectura habilitada." : "Lectura detallada desactivada."} {writable && props.snapshot ? "Certificación de prueba con protección concurrente, únicamente en el entorno aislado." : "Certificación desactivada: no se enviarán escrituras nuevas a producción."}</p>
    {props.snapshot && <article className={styles.reviewStatus} aria-label="Fotografía revisada para certificar">
      <h3>Información que estás revisando</h3>
      <p>Marcador: {props.snapshot.match.home_score ?? "Sin registrar"} – {props.snapshot.match.away_score ?? "Sin registrar"}</p>
      {props.snapshot.match.home_penalties !== null && props.snapshot.match.away_penalties !== null && <p>Penales: {props.snapshot.match.home_penalties} – {props.snapshot.match.away_penalties}</p>}
      <p>{props.snapshot.events.length} eventos registrados en esta fotografía.</p>
      {!props.snapshot.events.length && <p>Sin eventos registrados. Confirma expresamente si goles y tarjetas están completos; esto no implica una certificación automática.</p>}
      <ul>{props.snapshot.events.map(e => <li key={e.id}>
        {{ goal: "Gol", own_goal: "Autogol", yellow_card: "Amarilla", red_card: "Expulsión" }[e.event_type]} · {props.teamNames?.[e.team_id] ?? "Equipo registrado"} · {e.player_id ? props.names?.[e.player_id] ?? "Jugador registrado" : "Sin autor identificado"} · {e.minute === null ? "Sin minuto" : `${e.minute}′`}
        {e.dismissal_cause && <> · {e.dismissal_cause === "direct" ? "Roja directa" : "Doble amarilla"}</>}
        {e.notes && <p>{e.notes}</p>}
      </li>)}</ul>
      <p className={styles.hint}>Si otra persona corrige marcador o eventos, deberás actualizar y revisar esta información antes de certificar.</p>
    </article>}
    {props.error && <p className={styles.formError} role="alert">{props.error}</p>}
    <p className={styles.notice}>Goles y tarjetas se revisan por separado, incluso cuando hubo cero eventos. Las correcciones pueden invalidar la revisión correspondiente. Actualiza el acta antes de confirmar; la base rechaza versiones obsoletas y diferencias sin resolución válida.</p>
    <button className={styles.secondary} type="button" disabled={pending} onClick={() => router.refresh()}>Actualizar estado del acta</button>
    <form action={action} className={`${styles.form} ${styles.formPanel}`} aria-busy={pending} onChange={() => setConfirmed(false)}>
      <fieldset disabled={!enabled || pending || state.saved} className={styles.actaFieldset}>
        <legend>Estados revisados</legend>
        <label className={styles.checkLabel}><input type="checkbox" name="goals" checked={goals} onChange={e => setGoals(e.target.checked)} />Goles revisados y completos</label>
        <label htmlFor="goals-reference">Referencia del acta de goles</label>
        <textarea id="goals-reference" name="goalsReference" rows={2} maxLength={1000} required={goals} defaultValue={review?.goals_reference ?? ""} />
        <label className={styles.checkLabel}><input type="checkbox" name="cards" checked={cards} onChange={e => setCards(e.target.checked)} />Tarjetas revisadas y completas</label>
        <label htmlFor="cards-reference">Referencia del acta de tarjetas</label>
        <textarea id="cards-reference" name="cardsReference" rows={2} maxLength={1000} required={cards} defaultValue={review?.cards_reference ?? ""} />
        <label className={styles.checkLabel}><input type="checkbox" name="confirm" required checked={confirmed} onChange={e => { e.stopPropagation(); setConfirmed(e.target.checked); }} />Confirmo los estados revisados, incluidas las secciones con cero eventos.</label>
      </fieldset>
      {!finished && <p className={styles.hint}>Para certificar se requieren participantes y marcador de un partido finalizado.</p>}
      {state.error && <p role="alert" className={styles.formError}>{state.error}</p>}
      {state.saved && <p role="status" className={styles.success}>La base confirmó la certificación. Se actualizó la consulta del acta.</p>}
      <div className={styles.formActions}>
        <button className={styles.primary} disabled={!enabled || !confirmed || pending || state.saved}>{pending ? "Verificando acta…" : "Guardar revisión del acta"}</button>
        <button type="reset" className={styles.secondary} disabled={pending} onClick={() => { setGoals(review?.goals_complete ?? false); setCards(review?.cards_complete ?? false); setConfirmed(false); }}>Cancelar cambios de revisión</button>
      </div>
    </form>
  </section>;
}
