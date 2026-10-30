"use client";
import { useActionState, useState } from "react";
import {
  loadCardsAction,
  saveCardsAction,
  type CardFormState,
} from "./card-actions";
import { cardDefaults, cardOutcome, type CardState } from "@/lib/mundialito/events/cards";
import type { CardBinding } from "@/lib/mundialito/events/card-repository";
import type { RosterPlayer } from "@/lib/mundialito/players/model";
import styles from "../admin.module.css";
import { useRouter } from "next/navigation";
import type { OfficialEvent } from "@/lib/mundialito/events/model";

function CardEditor({
  state,
  scope,
  requestId,
  onClose,
  writable,
}: {
  state: CardState;
  scope: CardBinding;
  requestId: string;
  onClose: () => void;
  writable: boolean;
}) {
  const defaults = cardDefaults(state),
    [yellows, setYellows] = useState(String(defaults.yellows.length)),
    [direct, setDirect] = useState(defaults.directReds);
  const [selected, setSelected] = useState([
    defaults.yellows[0]?.id ?? "",
    defaults.yellows[1]?.id ?? "",
  ]);
  const [minutes, setMinutes] = useState([
    defaults.yellows[0]?.minute?.toString() ?? "",
    defaults.yellows[1]?.minute?.toString() ?? "",
  ]);
  const [redMinute, setRedMinute] = useState(
      defaults.red?.minute?.toString() ?? "",
    ),
    [confirmed, setConfirmed] = useState(false);
  const [result, action, pending] = useActionState(
    saveCardsAction.bind(null, { ...scope, state, requestId }),
    { error: "" } as CardFormState,
  );
  let outcome: ReturnType<typeof cardOutcome> | null = null;
  try {
    if (direct !== "") outcome = cardOutcome(Number(yellows), Number(direct));
  } catch {
    /* Invalid combination is displayed and blocked below. */
  }
  if (result.saved)
    return (
      <div className={styles.notice}>
        <p role="status">
          {result.superseded
            ? "Esta operación ya fue aplicada, pero hay cambios posteriores. Recarga las tarjetas para ver el estado vigente."
            : "Tarjetas guardadas. Las correcciones quedaron registradas y el acta afectada requiere nueva revisión cuando hubo cambios."}
        </p>
        <button type="button" className={styles.secondary} onClick={onClose}>
          Cerrar y recargar formulario
        </button>
      </div>
    );
  return (
    <form
      action={action}
      className={`${styles.form} ${styles.formPanel}`}
      onChange={() => setConfirmed(false)}
      aria-busy={pending}
    >
      <h3>Tarjetas del jugador</h3>
      {!writable && <p className={styles.notice}>Consulta disponible. El guardado de tarjetas está desactivado en este entorno.</p>}
      <fieldset className={styles.actaFieldset} disabled={!writable || pending}>
      <p className={styles.hint}>
        Rojas directas no incluye la expulsión generada por dos amarillas. Los
        minutos pueden quedar vacíos.
      </p>
      {defaults.reviewRequired && (
        <p role="alert" className={styles.formError}>
          El historial existente contiene una combinación excepcional. Requiere
          revisión; este formulario no lo sobrescribirá.
        </p>
      )}
      {defaults.red?.dismissal_cause === null && (
        <p className={styles.notice}>
          La roja histórica no tiene causa confirmada. Revisa el acta e indica
          las cantidades correctas antes de confirmar.
        </p>
      )}
      <label htmlFor="card-yellows">Amarillas</label>
      <select
        id="card-yellows"
        name="yellows"
        value={yellows}
        disabled={pending || defaults.reviewRequired}
        onChange={(e) => setYellows(e.target.value)}
      >
        {[0, 1, 2].map((n) => (
          <option value={n} key={n}>
            {n}
          </option>
        ))}
      </select>
      <label htmlFor="card-direct">Rojas directas</label>
      <select
        id="card-direct"
        name="direct_reds"
        value={direct}
        required
        disabled={pending || defaults.reviewRequired}
        onChange={(e) => setDirect(e.target.value)}
      >
        <option value="">Revisar y seleccionar</option>
        <option value="0">0</option>
        <option value="1">1</option>
      </select>
      {outcome ? (
        <div className={styles.notice} role="status">
          <strong>{outcome.label}</strong>
          <p>
            {yellows} amarillas · {direct} rojas directas · {outcome.expulsions}{" "}
            expulsiones · {outcome.points} puntos disciplinarios del partido.
          </p>
          {outcome.cause === "second_yellow" && (
            <p>
              Suspensión reglamentaria: un siguiente partido del equipo. Si el
              calendario es ambiguo, se requiere identificarlo oficialmente.
            </p>
          )}
          {outcome.cause === "direct" && (
            <p>
              La sanción requiere calificación conforme al reglamento; estas
              cantidades no determinan si hubo agresión ni su duración.
            </p>
          )}
          <p>
            Son puntos calculados de este registro. El desempate de grupos
            requiere actas certificadas y excluye tarjetas de eliminatorias.
          </p>
        </div>
      ) : (
        <p role="alert" className={styles.formError}>
          {direct === ""
            ? "Confirma si hubo roja directa."
            : "Dos amarillas y una roja directa: combinación inválida para el registro normal. Requiere revisión."}
        </p>
      )}
      {Array.from({ length: Math.min(Number(yellows), 2) }, (_, i) => (
        <div key={i}>
          <label htmlFor={`card-id-${i}`}>
            Amarilla {i + 1}: registro que se conserva
          </label>
          <select
            id={`card-id-${i}`}
            name={`yellow_id_${i}`}
            value={selected[i]}
            disabled={pending}
            onChange={(e) => {
              const id = e.target.value;
              setSelected(selected.map((v, j) => (j === i ? id : v)));
              const old = defaults.yellows.find((c) => c.id === id);
              setMinutes(
                minutes.map((v, j) =>
                  j === i ? (old?.minute?.toString() ?? "") : v,
                ),
              );
            }}
          >
            <option value="">Nueva amarilla</option>
            {defaults.yellows.map((e, j) => (
              <option key={e.id} value={e.id}>
                Conservar amarilla {j + 1} ·{" "}
                {e.minute === null ? "sin minuto" : `${e.minute}′`}
              </option>
            ))}
          </select>
          <label htmlFor={`card-minute-${i}`}>
            Minuto de amarilla {i + 1} (opcional)
          </label>
          <input
            id={`card-minute-${i}`}
            name={`yellow_minute_${i}`}
            type="number"
            inputMode="numeric"
            min={0}
            max={130}
            step={1}
            value={minutes[i]}
            disabled={pending}
            onChange={(e) =>
              setMinutes(minutes.map((v, j) => (j === i ? e.target.value : v)))
            }
          />
        </div>
      ))}
      {outcome?.cause && (
        <>
          <label htmlFor="card-red-minute">
            Minuto de expulsión (opcional)
          </label>
          <input
            id="card-red-minute"
            name="red_minute"
            type="number"
            inputMode="numeric"
            min={0}
            max={130}
            step={1}
            value={redMinute}
            onChange={(e) => setRedMinute(e.target.value)}
            disabled={pending}
          />
          {defaults.red?.minute !== null &&
            defaults.red?.minute !== undefined && (
              <>
                <p className={styles.hint}>
                  Si dejas el campo vacío, se conserva el minuto conocido{" "}
                  {defaults.red.minute}′. Para quitarlo, confirma abajo.
                </p>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    name="clear_red_minute"
                    disabled={pending}
                  />
                  Confirmo borrar el minuto conocido de expulsión (el campo debe
                  estar vacío).
                </label>
              </>
            )}
        </>
      )}
      {Number(yellows) < defaults.yellows.length && (
        <p className={styles.notice}>
          Se eliminarán las amarillas no seleccionadas. Al conservar una, elige
          cuál corresponde; sus notas e identidad se mantienen. La corrección se
          audita.
        </p>
      )}
      <label className={styles.checkLabel}>
        <input
          type="checkbox"
          name="confirm"
          required
          checked={confirmed}
          disabled={pending}
          onChange={(e) => {
            e.stopPropagation();
            setConfirmed(e.target.checked);
          }}
        />
        Confirmo las cantidades y minutos, incluida la eliminación de tarjetas
        que ya no correspondan.
      </label>
      </fieldset>
      {result.error && (
        <p role="alert" className={styles.formError}>
          {result.error}
        </p>
      )}
      <div className={styles.formActions}>
        <button
          className={styles.primary}
          disabled={
            !writable || pending || !confirmed || !outcome || defaults.reviewRequired
          }
        >
          {pending ? "Guardando…" : "Guardar tarjetas"}
        </button>
        <button
          className={styles.secondary}
          type="button"
          disabled={pending}
          onClick={onClose}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
function CardLoader({
  scope,
  onClose,
  writable,
}: {
  scope: CardBinding;
  onClose: () => void;
  writable: boolean;
}) {
  const [state, action, pending] = useActionState(
    loadCardsAction.bind(null, scope),
    { error: "" } as CardFormState,
  );
  if (state.loaded)
    return (
      <CardEditor
        state={state.loaded}
        scope={scope}
        requestId={state.loaded.requestId}
        onClose={onClose}
        writable={writable}
      />
    );
  return (
    <form action={action} className={styles.formPanel}>
      <p>Consulta las tarjetas guardadas antes de editar sus cantidades.</p>
      {state.error && (
        <p role="alert" className={styles.formError}>
          {state.error}
        </p>
      )}
      <div className={styles.formActions}>
        <button className={styles.primary} disabled={pending}>
          {pending ? "Consultando…" : "Cargar tarjetas del jugador"}
        </button>
        <button
          className={styles.secondary}
          type="button"
          disabled={pending}
          onClick={onClose}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
export function CardPanel({
  matchId,
  teams,
  players,
  readable = false,
  writable = false,
  recordedEvents = [],
}: {
  matchId: string;
  teams: { id: string; name: string }[];
  players: RosterPlayer[];
  readable?: boolean;
  writable?: boolean;
  recordedEvents?: OfficialEvent[];
}) {
  const [team, setTeam] = useState(teams[0]?.id ?? ""),
    [player, setPlayer] = useState(""),
    [editing, setEditing] = useState(false);
  const router=useRouter();
  return (
    <section>
      <h2>Tarjetas por jugador</h2>
      <p className={styles.notice}>
        Selecciona un jugador e indica cantidades. La expulsión se deriva
        automáticamente; no es necesario seleccionar su causa. La lectura y el
        guardado tienen autorizaciones independientes. El guardado requiere
        autorización y configuración explícitas, sin depender de certificación.
      </p>
      {!readable&&<p className={styles.notice}>La consulta detallada por jugador está desactivada por configuración. No es un requisito de certificación v2.</p>}
      {recordedEvents.length>0&&<ul>{recordedEvents.map(e=><li key={e.id}>
        {e.event_type==="yellow_card"?"Amarilla":"Expulsión"} · {players.find(p=>p.id===e.player_id)?.fullName??"Jugador registrado"} · {e.minute===null?"Sin minuto":`${e.minute}′`}
      </li>)}</ul>}
      <div className={styles.formPanel}>
        <label htmlFor="cards-team">Equipo</label>
        <select
          id="cards-team"
          value={team}
          disabled={editing}
          onChange={(e) => {
            setTeam(e.target.value);
            setPlayer("");
          }}
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <label htmlFor="cards-player">Jugador</label>
        <select
          id="cards-player"
          value={player}
          disabled={editing}
          onChange={(e) => setPlayer(e.target.value)}
        >
          <option value="">Selecciona jugador</option>
          {players
            .filter((p) => p.teamId === team)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
                {p.active ? "" : " · inactivo actualmente"}
              </option>
            ))}
        </select>
        <button
          type="button"
          className={styles.primary}
          disabled={!readable || teams.length !== 2 || !player || editing}
          onClick={() => setEditing(true)}
        >
          Revisar cantidades de tarjetas
        </button>
      </div>
      {editing && (
        <CardLoader
          key={player}
          scope={{ matchId, teamId: team, playerId: player }}
          writable={writable}
          onClose={() => {setEditing(false);router.refresh();}}
        />
      )}
    </section>
  );
}
