"use client";
import Link from "next/link";
import { useState } from "react";
import {
  normalizePlayerName,
  positions,
  type RosterPlayer,
} from "@/lib/mundialito/players/model";
import styles from "../admin.module.css";
export function RosterList({
  players,
  teamSlug,
}: {
  players: RosterPlayer[];
  teamSlug: string;
}) {
  const [search, setSearch] = useState("");
  const visible = players.filter((p) =>
    normalizePlayerName(p.fullName).includes(normalizePlayerName(search)),
  );
  return (
    <>
      <label className={styles.searchLabel} htmlFor="player-search">
        Buscar jugador por nombre
      </label>
      <input
        className={styles.searchInput}
        id="player-search"
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Escribe un nombre…"
      />
      <p className={styles.hint} aria-live="polite">
        {visible.length} de {players.length} jugadores ·{" "}
        {players.filter((p) => p.active).length} activos
      </p>
      <ul className={styles.rosterCards}>
        {visible.map((player) => (
          <li key={player.id} className={styles.rosterCard}>
            <span
              className={styles.shirtNumber}
              aria-label={
                player.shirtNumber === null
                  ? "Sin dorsal"
                  : `Dorsal ${player.shirtNumber}`
              }
            >
              {player.shirtNumber ?? "—"}
            </span>
            <div className={styles.rosterIdentity}>
              <h2>{player.fullName}</h2>
              <p>
                {player.position
                  ? positions[player.position]
                  : "Posición sin registrar"}
              </p>
              <span
                className={
                  player.active ? styles.activeBadge : styles.inactiveBadge
                }
              >
                {player.active ? "Activo" : "Inactivo"}
              </span>
            </div>
            <Link
              className={styles.editLink}
              href={`/mundialito/admin/jugadores/${teamSlug}/${player.id}/editar`}
            >
              Editar<span className="sr-only"> a {player.fullName}</span>
            </Link>
          </li>
        ))}
      </ul>
      {!visible.length && (
        <p className={styles.notice}>
          {players.length
            ? "No hay coincidencias para esa búsqueda."
            : "Este equipo todavía no tiene jugadores registrados. Utiliza Fichar jugador para comenzar con una nómina real."}
        </p>
      )}
    </>
  );
}
