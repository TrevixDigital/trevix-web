"use client";
import Link from "next/link";
import { useState } from "react";
import {
  phaseLabels,
  statusLabels,
  type MatchPhase,
  filterMatches,
} from "@/lib/mundialito/matches/model";
import styles from "../admin.module.css";
export interface MatchCard {
  id: string;
  number: number;
  phase: MatchPhase;
  dayId: string | null;
  dayNumber: number | null;
  group: string | null;
  home: string;
  away: string;
  status: keyof typeof statusLabels;
  at: string | null;
  venue: string | null;
  homeScore: number | null;
  awayScore: number | null;
  penalties: string | null;
}
export function MatchBrowser({ matches }: { matches: MatchCard[] }) {
  const [phase, setPhase] = useState<MatchPhase>("groups"),
    [day, setDay] = useState(
      matches
        .filter((m) => m.phase === "groups")
        .sort(
          (a, b) => (a.dayNumber ?? Infinity) - (b.dayNumber ?? Infinity),
        )[0]?.dayId ?? "",
    ),
    [status, setStatus] = useState(""),
    [search, setSearch] = useState("");
  const phaseMatches = matches.filter((m) => m.phase === phase),
    days = [
      ...new Map(
        phaseMatches.map((m) => [m.dayId ?? "unassigned", m.dayNumber]),
      ).entries(),
    ].sort((a, b) => (a[1] ?? Infinity) - (b[1] ?? Infinity));
  const visible = filterMatches(matches, { phase, day, status, search });
  return (
    <>
      <div className={styles.formPanel}>
        <label className={styles.searchLabel} htmlFor="phase">
          Fase
        </label>
        <select
          id="phase"
          value={phase}
          onChange={(e) => {
            setPhase(e.target.value as MatchPhase);
            setDay("");
          }}
        >
          {Object.entries(phaseLabels).map(([v, t]) => (
            <option value={v} key={v}>
              {t}
            </option>
          ))}
        </select>
        <label className={styles.searchLabel} htmlFor="day">
          Jornada
        </label>
        <select id="day" value={day} onChange={(e) => setDay(e.target.value)}>
          <option value="">Todas las jornadas de esta fase</option>
          {days.map(([id, n]) => (
            <option key={id} value={id}>
              {n === null ? "Sin jornada asignada" : `Jornada ${n}`}
            </option>
          ))}
        </select>
        <label className={styles.searchLabel} htmlFor="status">
          Estado
        </label>
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {Object.entries(statusLabels).map(([v, t]) => (
            <option value={v} key={v}>
              {t}
            </option>
          ))}
        </select>
        <label className={styles.searchLabel} htmlFor="team-search">
          Buscar equipo
        </label>
        <input
          className={styles.searchInput}
          id="team-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nombre del equipo"
        />
      </div>
      <p aria-live="polite" className={styles.hint}>
        {visible.length} encuentros en esta selección · {matches.length}{" "}
        oficiales en total.
      </p>
      {days
        .filter(([id]) => visible.some((m) => (m.dayId ?? "unassigned") === id))
        .map(([id, n]) => (
          <section key={id}>
            <h2>{n === null ? "Sin jornada asignada" : `Jornada ${n}`}</h2>
            {[
              ...new Set(
                visible
                  .filter((m) => (m.dayId ?? "unassigned") === id)
                  .map((m) => m.group),
              ),
            ].map((group) => (
              <div key={group ?? "bracket"}>
                {group && <h3>Grupo {group}</h3>}
                <ul className={styles.rosterCards}>
                  {visible
                    .filter(
                      (m) =>
                        (m.dayId ?? "unassigned") === id && m.group === group,
                    )
                    .map((m) => (
                      <li className={styles.notice} key={m.id}>
                        <p>
                          Partido {m.number} · {statusLabels[m.status]}
                        </p>
                        <h3>
                          {m.home}{" "}
                          {(m.status === "live" || m.status === "finished") &&
                          m.homeScore !== null &&
                          m.awayScore !== null
                            ? `${m.homeScore} – ${m.awayScore}`
                            : "VS"}{" "}
                          {m.away}
                        </h3>
                        {m.penalties && <p>Penales: {m.penalties}</p>}
                        <p>
                          {m.at
                            ? new Intl.DateTimeFormat("es-GT", {
                                timeZone: "America/Guatemala",
                                dateStyle: "medium",
                                timeStyle: "short",
                              }).format(new Date(m.at))
                            : "Fecha por confirmar"}{" "}
                          · {m.venue ?? "Sede por confirmar"}
                        </p>
                        <Link
                          className={styles.editLink}
                          href={`/mundialito/admin/partidos/${m.id}/editar`}
                        >
                          Editar partido {m.number}
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      {!visible.length && (
        <p className={styles.notice}>No hay encuentros para estos filtros.</p>
      )}
    </>
  );
}
