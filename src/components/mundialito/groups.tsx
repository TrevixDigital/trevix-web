import Link from "next/link";
import { UsersRound } from "lucide-react";
import { getCompetitionReport } from "@/lib/mundialito/repositories/tournament";
import { qualification } from "@/lib/mundialito/engine/tournament";
import { PendingNotice, StateBadge } from "@/components/mundialito/data-ui";
const columns = [
  ["played", "PJ", "Partidos jugados"],
  ["won", "G", "Ganados"],
  ["drawn", "E", "Empatados"],
  ["lost", "P", "Perdidos"],
  ["gf", "GF", "Goles a favor"],
  ["ga", "GC", "Goles en contra"],
  ["gd", "DG", "Diferencia de goles"],
  ["points", "PTS", "Puntos"],
] as const;
export async function Groups({
  overview = false,
}: { overview?: boolean } = {}) {
  const report = await getCompetitionReport(),snapshot=report.calculation;
  return (
    <div
      className={`groups-grid ${overview ? "groups-overview" : "standings-grid"}`}
    >
      {snapshot.groups.map((group) => (
        <article
          key={group.group}
          id={`grupo-${group.group.toLowerCase()}`}
          className={`group-card group-${group.group.toLowerCase()}`}
        >
          <header>
            <h3>
              <UsersRound size={21} aria-hidden="true" /> GRUPO {group.group}
            </h3>
            <span>03 EQUIPOS</span>
          </header>
          {overview ? (
            <ul className="team-name-list">
              {group.rows.map((row) => (
                <li key={row.team.slug}>
                  <Link href={`/mundialito/equipos/${row.team.slug}`}>
                    {row.team.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label={`Tabla completa del grupo ${group.group}, desplazable horizontalmente`}
              >
                <table className="group-table standings-table">
                  <caption className="sr-only">
                    Grupo {group.group}.{" "}
                    {group.complete
                      ? "Fase de grupos completada"
                      : "Clasificación provisional"}
                    . Las posiciones empatadas quedan pendientes.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">
                        <abbr title="Posición">POS</abbr>
                      </th>
                      <th scope="col">EQUIPO</th>
                      {columns.map(([, label, title]) => (
                        <th scope="col" key={label}>
                          <abbr title={title}>{label}</abbr>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => (
                      <tr
                        key={row.team.slug}
                        className={
                          group.hasResults &&
                          row.possiblePositions.every((p) => p <= 2)
                            ? "qualifying-row"
                            : ""
                        }
                      >
                        <td>{row.position ?? "—"}</td>
                        <th scope="row">
                          <Link href={`/mundialito/equipos/${row.team.slug}`}>
                            {row.team.name}
                          </Link>
                          <span className="row-qualification">
                            {report.publication.status!=="official"&&qualification(row,group,snapshot)==="Clasificado confirmado"?"En clasificación calculada · provisional":qualification(row, group, snapshot)}
                          </span>
                        </th>
                        {columns.map(([key]) => (
                          <td key={key}>
                            {group.hasResults ? row.stats[key] : "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="group-note">
                <StateBadge
                  state={
                    group.complete &&
                    report.publication.status==="official" &&
                    group.rows.every((row) => row.position !== null)
                      ? "confirmed"
                      : group.hasResults
                        ? "provisional"
                        : "pending"
                  }
                />
                {group.complete
                  ? "Resultados del grupo completados"
                  : "Posiciones sujetas a resultados y desempates"}
                <PendingNotice
                  reasons={group.rows.flatMap((row) => row.pending)}
                />
              </div>
            </>
          )}
        </article>
      ))}
    </div>
  );
}
