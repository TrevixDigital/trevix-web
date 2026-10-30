"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import {
  localMatchDate,
  statusLabels,
  type MatchValues,
} from "@/lib/mundialito/matches/model";
import { saveMatchAction } from "./actions";
import styles from "../admin.module.css";
export function MatchForm({
  id,
  version,
  phase,
  values,
}: {
  id: string;
  version: string;
  phase: string;
  values: MatchValues;
}) {
  const [state, action, pending] = useActionState(
    saveMatchAction.bind(null, { id, version }),
    { error: "" },
  );
  const [current, setCurrent] = useState(values),
    [confirmed, setConfirmed] = useState(false);
  const [date, setDate] = useState(localMatchDate(values.scheduled_at));
  if (state.success)
    return (
      <section className={styles.formPanel}>
        <h2>Partido guardado</h2>
        <p role="status" className={styles.success}>
          Supabase confirmó los datos.
          {state.success.repeated
            ? " La solicitud ya estaba guardada; no se repitió el UPDATE."
            : ""}{" "}
          {state.success.auditVerified ? "Auditoría verificada." : ""}
        </p>
        {state.success.warning && (
          <p className={styles.notice} role="alert">
            {state.success.warning}
          </p>
        )}
        <div className={styles.formActions}>
          <Link href="/mundialito/grupos" className={styles.primary}>Ver clasificación provisional</Link>
          <Link href={`/mundialito/admin/partidos/${id}/editar`} className={styles.secondary}>Revisar acta guardada</Link>
          <Link href="/mundialito/admin/partidos" className={styles.secondary}>Volver a partidos</Link>
        </div>
      </section>
    );
  const score = (
    field: "home_score" | "away_score" | "home_penalties" | "away_penalties",
    label: string,
  ) => (
    <div>
      <label htmlFor={field}>{label}</label>
      <input
        id={field}
        name={field}
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={current[field] ?? ""}
        placeholder="Sin registrar"
        disabled={pending}
        onChange={(e) =>
          setCurrent({
            ...current,
            [field]: e.target.value === "" ? null : Number(e.target.value),
          })
        }
      />
    </div>
  );
  return (
    <form
      action={action}
      className={`${styles.form} ${styles.formPanel}`}
      aria-busy={pending}
      onChange={() => setConfirmed(false)}
    >
      <p className={styles.hint}>
        Fecha y hora de Guatemala (UTC−06:00). Vacío significa NULL; no se
        rellenan ceros automáticamente.
      </p>
      <div className={styles.formColumns}>
        <div>
          <label htmlFor="date">Fecha</label>
          <input
            id="date"
            type="date"
            name="date"
            value={date.date}
            onChange={(e) => setDate({ ...date, date: e.target.value })}
            disabled={pending}
          />
        </div>
        <div>
          <label htmlFor="time">Hora</label>
          <input
            id="time"
            type="time"
            name="time"
            value={date.time}
            onChange={(e) => setDate({ ...date, time: e.target.value })}
            disabled={pending}
          />
        </div>
      </div>
      <label htmlFor="venue">Sede</label>
      <input
        id="venue"
        name="venue"
        value={current.venue ?? ""}
        onChange={(e) => setCurrent({ ...current, venue: e.target.value })}
        disabled={pending}
      />
      <label htmlFor="status">Estado</label>
      <select
        id="status"
        name="status"
        value={current.status}
        onChange={(e) =>
          setCurrent({
            ...current,
            status: e.target.value as MatchValues["status"],
          })
        }
        disabled={pending}
      >
        {Object.entries(statusLabels).map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
      <div className={styles.formColumns}>
        {score("home_score", "Goles local")}
        {score("away_score", "Goles visitante")}
      </div>
      {phase !== "groups" ? (
        <>
          <p className={styles.hint}>
            Penales solo con partido finalizado y empatado. Sin tanda válida el
            empate no produce clasificado.
          </p>
          <div className={styles.formColumns}>
            {score("home_penalties", "Penales local")}
            {score("away_penalties", "Penales visitante")}
          </div>
        </>
      ) : (
        <>
          <input type="hidden" name="home_penalties" value="" />
          <input type="hidden" name="away_penalties" value="" />
        </>
      )}
      <label htmlFor="notes">Observaciones</label>
      <textarea
        className={styles.searchInput}
        id="notes"
        name="notes"
        value={current.notes ?? ""}
        onChange={(e) => setCurrent({ ...current, notes: e.target.value })}
        rows={4}
        disabled={pending}
      />
      <p className={styles.notice}>
        Revisa estado y marcador antes de guardar. Un cambio de resultado puede
        modificar posiciones y llaves. No se crearán eventos individuales.
      </p>
      <label className={styles.checkLabel}>
        <input
          type="checkbox"
          name="confirm"
          checked={confirmed}
          onChange={(e) => {
            e.stopPropagation();
            setConfirmed(e.target.checked);
          }}
          disabled={pending}
          required
        />{" "}
        Confirmo los cambios revisados
      </label>
      {state.error && (
        <p role="alert" className={styles.formError}>
          {state.error}
        </p>
      )}
      <div className={styles.formActions}>
        <button className={styles.primary} disabled={pending || !confirmed}>
          {pending ? "Guardando…" : "Guardar partido"}
        </button>
        <Link
          className={styles.secondary}
          href="/mundialito/admin/partidos"
          aria-disabled={pending}
          onClick={(e) => {
            if (pending) e.preventDefault();
          }}
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
