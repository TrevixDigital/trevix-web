"use client";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { eventAction } from "./event-actions";
import { eventLabels, type OfficialEvent } from "@/lib/mundialito/events/model";
import type { RosterPlayer } from "@/lib/mundialito/players/model";
import styles from "../admin.module.css";
interface Editor {
  id: string;
  mode: "create" | "edit" | "delete";
  event?: OfficialEvent;
}
function EventForm({
  matchId,
  editor,
  teams,
  players,
  onClose,
  onNext,
}: {
  matchId: string;
  editor: Editor;
  teams: { id: string; name: string }[];
  players: RosterPlayer[];
  onClose: (nextId?: string) => void;
  onNext: (id: string) => void;
}) {
  const [state, action, pending] = useActionState(
    eventAction.bind(null, {
      id: editor.id,
      matchId,
      mode: editor.mode,
      version: editor.event?.updated_at,
    }),
    { error: "" },
  );
  const [values, setValues] = useState({
    team_id: editor.event?.team_id ?? teams[0]?.id ?? "",
    player_id: editor.event?.player_id ?? "",
    event_type: editor.event?.event_type ?? "goal",
    minute: editor.event?.minute?.toString() ?? "",
    notes: editor.event?.notes ?? "",
  });
  const [confirmed, setConfirmed] = useState(false),
    deleting = editor.mode === "delete";
  if (state.success)
    return (
      <div className={styles.notice}>
        <p role="status">
          {deleting ? "Eliminación confirmada" : "Evento confirmado"}.
          {state.success.repeated ? " No se repitió la escritura." : ""}
        </p>
        {state.success.warnings.map((w) => (
          <p key={w}>{w}</p>
        ))}
        <p>
          Consulta Historial para comprobar el responsable y los valores
          anteriores/nuevos registrados por la revisión 4.
        </p>
        <div className={styles.formActions}>
          <button
            className={styles.secondary}
            onClick={() => onClose(state.success!.nextId)}
          >
            Cerrar
          </button>
          {!deleting && (
            <button
              className={styles.primary}
              onClick={() => onNext(state.success!.nextId)}
            >
              Registrar otro evento
            </button>
          )}
        </div>
      </div>
    );
  return (
    <form
      action={action}
      className={`${styles.form} ${styles.formPanel}`}
      aria-busy={pending}
      onChange={() => setConfirmed(false)}
    >
      <h3>
        {deleting
          ? "Eliminar evento"
          : editor.mode === "edit"
            ? "Corregir evento"
            : "Registrar evento"}
      </h3>
      {deleting ? (
        <p className={styles.notice}>
          Se eliminará {eventLabels[editor.event!.event_type]}. Confirma que fue
          registrado por error. No se modificará el marcador ni se eliminará al
          jugador.
        </p>
      ) : (
        <>
          <label htmlFor="event-team">Equipo del jugador</label>
          <select
            id="event-team"
            name="team_id"
            value={values.team_id}
            onChange={(e) =>
              setValues({ ...values, team_id: e.target.value, player_id: "" })
            }
            disabled={pending}
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <label htmlFor="event-type">Tipo</label>
          <select
            id="event-type"
            name="event_type"
            value={values.event_type}
            onChange={(e) =>
              setValues({
                ...values,
                event_type: e.target.value as typeof values.event_type,
              })
            }
            disabled={pending}
          >
            {Object.entries(eventLabels)
              .filter(([v]) => v === "goal" || v === "own_goal")
              .map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
          </select>
          <label htmlFor="event-player">Jugador de la nómina</label>
          <select
            id="event-player"
            name="player_id"
            value={values.player_id}
            onChange={(e) =>
              setValues({ ...values, player_id: e.target.value })
            }
            required={values.event_type !== "own_goal"}
            disabled={pending}
          >
            <option value="">
              {values.event_type === "own_goal"
                ? "Autor de autogol desconocido"
                : "Selecciona jugador"}
            </option>
            {players
              .filter((p) => p.teamId === values.team_id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                  {p.active ? "" : " · inactivo actualmente"}
                </option>
              ))}
          </select>
          <p className={styles.hint}>
            Autogol: selecciona al equipo que lo comete; el gol se cuenta para
            el rival. No registres lanzamientos de tanda como goles.
          </p>
          <label htmlFor="event-minute">Minuto (opcional, 0–130)</label>
          <input
            id="event-minute"
            name="minute"
            type="number"
            inputMode="numeric"
            min={0}
            max={130}
            step={1}
            value={values.minute}
            onChange={(e) => setValues({ ...values, minute: e.target.value })}
            disabled={pending}
          />
          <label htmlFor="event-notes">Observaciones</label>
          <textarea
            id="event-notes"
            name="notes"
            className={styles.searchInput}
            rows={3}
            value={values.notes}
            onChange={(e) => setValues({ ...values, notes: e.target.value })}
            disabled={pending}
          />
        </>
      )}
      <label className={styles.checkLabel}>
        <input
          name="confirm"
          type="checkbox"
          checked={confirmed}
          required
          disabled={pending}
          onChange={(e) => {
            e.stopPropagation();
            setConfirmed(e.target.checked);
          }}
        />
        Confirmo el hecho oficial y{" "}
        {deleting ? "su eliminación" : "los datos revisados"}
      </label>
      {state.error && (
        <p className={styles.formError} role="alert">
          {state.error}
        </p>
      )}
      <div className={styles.formActions}>
        <button className={styles.primary} disabled={pending || !confirmed}>
          {pending
            ? "Guardando…"
            : deleting
              ? "Eliminar evento incorrecto"
              : "Guardar evento"}
        </button>
        <button
          type="button"
          className={styles.secondary}
          disabled={pending}
          onClick={() => onClose()}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
export function EventPanel({
  matchId,
  newId,
  events,
  players,
  teams,
  warnings,
}: {
  matchId: string;
  newId: string;
  events: OfficialEvent[];
  players: RosterPlayer[];
  teams: { id: string; name: string }[];
  warnings: string[];
}) {
  const [editor, setEditor] = useState<Editor | null>(null),
    [nextId, setNextId] = useState(newId);
  const router=useRouter();
  return (
    <section>
      <h2>Eventos del partido</h2>
      <p className={styles.notice}>
        Goles y autogoles se registran por separado del marcador. Revisa las
        diferencias antes de certificar el acta. Las tarjetas se administran por
        jugador; los asuntos pendientes del Comité se muestran por separado.
      </p>
      {warnings.map((w) => (
        <p role="alert" className={styles.notice} key={w}>
          {w}
        </p>
      ))}
      {teams.length === 2 ? (
        <button
          className={styles.primary}
          onClick={() => setEditor({ id: nextId, mode: "create" })}
          disabled={editor !== null}
        >
          Registrar evento
        </button>
      ) : (
        <p className={styles.notice}>
          Faltan equipos definidos en Supabase; no se inventarán participantes.
        </p>
      )}
      <ul className={styles.rosterCards}>
        {events.map((e) => (
          <li key={e.id} className={styles.notice}>
            <strong>{eventLabels[e.event_type]}</strong>
            <p>
              {teams.find((t) => t.id === e.team_id)?.name} ·{" "}
              {players.find((p) => p.id === e.player_id)?.fullName ??
                "Autor de autogol no identificado"}{" "}
              · {e.minute === null ? "Sin minuto" : `${e.minute}′`}
            </p>
            {e.notes && <p>{e.notes}</p>}
            {e.event_type === "yellow_card" || e.event_type === "red_card" ? (
              <p>
                Editar cantidades en «Tarjetas por jugador»; la expulsión se
                calcula automáticamente.
              </p>
            ) : (
              <div className={styles.formActions}>
                <button
                  className={styles.secondary}
                  disabled={editor !== null}
                  onClick={() =>
                    setEditor({ id: e.id, mode: "edit", event: e })
                  }
                >
                  Editar
                </button>
                <button
                  className={styles.secondary}
                  disabled={editor !== null}
                  onClick={() =>
                    setEditor({ id: e.id, mode: "delete", event: e })
                  }
                >
                  Eliminar incorrecto
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!events.length && (
        <p className={styles.notice}>
          No hay eventos registrados. Esto no certifica que no hubo goles o
          tarjetas.
        </p>
      )}
      {editor && (
        <EventForm
          key={editor.id + editor.mode}
          matchId={matchId}
          editor={editor}
          teams={teams}
          players={players}
          onClose={(fresh) => {
            if (fresh) {setNextId(fresh);router.refresh();}
            setEditor(null);
          }}
          onNext={(id) => {
            router.refresh();
            setNextId(id);
            setEditor({ id, mode: "create" });
          }}
        />
      )}
    </section>
  );
}
