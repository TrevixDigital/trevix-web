"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import {
  duplicateWarnings,
  positions,
  type RosterTeam,
  type RosterPlayer,
  type PlayerValues,
} from "@/lib/mundialito/players/model";
import { savePlayerAction } from "./actions";
import styles from "../admin.module.css";
export function PlayerForm({
  team,
  id,
  player,
  roster,
}: {
  team: RosterTeam;
  id: string;
  player?: RosterPlayer;
  roster: RosterPlayer[];
}) {
  const [values, setValues] = useState({
    fullName: player?.fullName ?? "",
    shirtNumber: player?.shirtNumber?.toString() ?? "",
    position: player?.position ?? "",
    active: player?.active ?? true,
  });
  const [state, action, pending] = useActionState(
    savePlayerAction.bind(null, {
      teamSlug: team.slug,
      id,
      mode: player ? "edit" : "create",
      version: player?.updatedAt,
    }),
    { error: "" },
  );
  const warnings = duplicateWarnings(
    {
      fullName: values.fullName,
      shirtNumber: values.shirtNumber ? Number(values.shirtNumber) : null,
      position: values.position || null,
      active: values.active,
    } as PlayerValues,
    roster,
    id,
  );
  if (state.success)
    return (
      <section className={styles.formPanel}>
        <h2>{player ? "Cambios confirmados" : "Fichaje confirmado"}</h2>
        <p className={styles.success} role="status">
          {state.success.name} · Supabase confirmó el guardado.
          {state.success.repeated
            ? " La solicitud ya se había recibido; no se creó otro jugador."
            : ""}
        </p>
        {state.success.warnings.map((w) => (
          <p className={styles.notice} key={w}>
            {w}
          </p>
        ))}
        <div className={styles.formActions}>
          <Link
            href={`/mundialito/admin/jugadores/${team.slug}`}
            className={styles.primary}
          >
            Ver nómina
          </Link>
          {!player && (
            <Link
              href={`/mundialito/admin/jugadores/${team.slug}/nuevo?ficha=${state.success.nextRegistrationId}`}
              className={styles.secondary}
            >
              Fichar otro jugador
            </Link>
          )}
        </div>
      </section>
    );
  return (
    <form
      action={action}
      className={`${styles.form} ${styles.formPanel}`}
      aria-busy={pending}
    >
      <p className={styles.notice}>
        Equipo: <strong>{team.name}</strong>.{" "}
        {player
          ? "La edición conserva el ID, el equipo y los enlaces del jugador."
          : "El jugador se registrará en este equipo oficial."}
      </p>
      <label htmlFor="player-name">Nombre completo *</label>
      <input
        id="player-name"
        name="full_name"
        autoComplete="name"
        value={values.fullName}
        onChange={(e) => setValues({ ...values, fullName: e.target.value })}
        minLength={2}
        required
        disabled={pending}
      />
      <div className={styles.formColumns}>
        <div>
          <label htmlFor="player-shirt">
            Número de camiseta <span className={styles.hint}>(opcional)</span>
          </label>
          <input
            id="player-shirt"
            name="shirt_number"
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            step={1}
            placeholder="Sin dorsal"
            value={values.shirtNumber}
            onChange={(e) =>
              setValues({ ...values, shirtNumber: e.target.value })
            }
            disabled={pending}
          />
        </div>
        <div>
          <label htmlFor="player-position">
            Posición <span className={styles.hint}>(opcional)</span>
          </label>
          <select
            id="player-position"
            name="position"
            value={values.position}
            onChange={(e) =>
              setValues({
                ...values,
                position: e.target.value as typeof values.position,
              })
            }
            disabled={pending}
          >
            <option value="">Sin registrar</option>
            {Object.entries(positions).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className={styles.checkLabel}>
        <input
          type="checkbox"
          name="is_active"
          checked={values.active}
          onChange={(e) => setValues({ ...values, active: e.target.checked })}
          disabled={pending}
        />{" "}
        Jugador activo
      </label>
      <p className={styles.hint}>
        Al desactivarlo se conserva su ficha e historial; deja de aparecer en la
        nómina pública actual.
      </p>
      {warnings.map((w) => (
        <p className={styles.notice} key={w}>
          {w}
        </p>
      ))}
      {state.error && (
        <p className={styles.formError} role="alert">
          {state.error}
        </p>
      )}
      <div className={styles.formActions}>
        <button className={styles.primary} type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar jugador"}
        </button>
        <Link
          className={styles.secondary}
          href={`/mundialito/admin/jugadores/${team.slug}`}
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
