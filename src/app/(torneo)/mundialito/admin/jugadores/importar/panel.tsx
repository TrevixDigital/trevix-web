"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { startOfficialImport, continueOfficialImport } from "./actions";
import type { PublicOfficialRun } from "@/lib/mundialito/players/official-import-server";
import styles from "../../admin.module.css";
export function OfficialImportPanel({
  planHash,
  initial,
}: {
  planHash: string;
  initial?: PublicOfficialRun;
}) {
  const [run, setRun] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const sending = useRef(false);
  async function execute() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      let current = run;
      if (!current) {
        const start = await startOfficialImport(planHash);
        if (!start.run) {
          setError(start.error);
          return;
        }
        current = start.run;
        setRun(current);
        // A reload resumes the durable server journal instead of starting a new import.
        window.history.replaceState(null, "", `?run=${current.id}`);
      }
      while (!current.complete) {
        const next = await continueOfficialImport(current.id);
        if (next.run) {
          current = next.run;
          setRun(current);
        }
        if (next.error || !next.run) {
          setError(
            next.error ||
              "La ejecución no se confirmó. Conserva este enlace para reanudar.",
          );
          break;
        }
      }
    } catch {
      setError(
        "Se perdió la conexión o no pudo actualizarse la interfaz. Recarga este mismo enlace para consultar y reanudar la ejecución; no inicies otra.",
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className={styles.formPanel}>
      <h2>
        {run?.complete
          ? "Proceso finalizado: revisa el informe"
          : "Ejecutar con mi sesión administrativa"}
      </h2>
      <p>
        Se registra el plan antes de escribir. Solo INSERT individuales para
        nuevos jugadores; no se ejecutan UPDATE ni DELETE. Una incidencia
        ambigua queda pendiente y un error detiene la ejecución.
      </p>
      {!run?.complete && (
        <button
          type="button"
          className={styles.primary}
          disabled={busy}
          onClick={execute}
        >
          {busy
            ? "Importando… mantén esta página abierta"
            : run
              ? "Reanudar la misma ejecución"
              : "Importar las cuatro nóminas autorizadas"}
        </button>
      )}
      <div role="status" aria-live="polite">
        {run && (
          <p>
            {run.cursor} de {run.total} nombres procesados.
            {run.complete ? " Proceso terminado; revisa el informe." : ""}
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className={styles.formError}>
          {error}
        </p>
      )}
      {run?.error && !error && (
        <p role="alert" className={styles.formError}>
          {run.error}
        </p>
      )}
      {run && (
        <>
          <p className={styles.hint}>Ejecución: {run.id}</p>
          <Link className={styles.backLink} href={`?run=${run.id}`}>
            Enlace para consultar o reanudar esta ejecución
          </Link>
          {run.verification && (
            <>
              <p className={styles.notice}>
                Total del torneo: {run.verification.totalTournament}. Fichas
                preexistentes intactas:{" "}
                {run.verification.preserved ? "Sí" : "REVISAR"}. Nuevos con
                dorsal/posición NULL y activos:{" "}
                {run.verification.newDefaultsValid ? "Sí" : "REVISAR"}.
              </p>
              {run.verification.teams.map((t) => (
                <article className={styles.notice} key={t.team}>
                  <strong>{t.team}</strong>
                  <p>
                    {t.validNames} nombres · {t.inserted} nuevos confirmados ·{" "}
                    {t.existing} existentes conservados · {t.pending} pendientes
                    · {t.total} jugadores actuales · {t.duplicates} duplicados
                    detectados.
                  </p>
                  <Link
                    href={`/mundialito/admin/jugadores/${t.team}`}
                    className={styles.backLink}
                  >
                    Ver nómina
                  </Link>
                  {" · "}
                  <Link href={`/mundialito/equipos/${t.team}`} className={styles.backLink}>
                    Ver página pública
                  </Link>
                </article>
              ))}
            </>
          )}
          <details>
            <summary>Registro individual</summary>
            <ul>
              {run.outcomes.map((o) => (
                <li key={o.index}>
                  {o.teamSlug} · {o.name} ·{" "}
                  {o.status === "inserted"
                    ? "Alta confirmada"
                    : o.status === "existing"
                      ? "Existente conservado"
                      : "Revisión pendiente"}{" "}
                  · {o.detail}
                </li>
              ))}
            </ul>
          </details>
          <a
            className={styles.backLink}
            href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(run, null, 2))}`}
            download={`importacion-${run.id}.json`}
          >
            Descargar informe JSON
          </a>
        </>
      )}
    </section>
  );
}
