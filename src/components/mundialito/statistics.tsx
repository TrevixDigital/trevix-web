import Link from "next/link";
import { getTournament } from "@/lib/mundialito/repositories/tournament";
import { DataEmpty } from "@/components/mundialito/data-ui";
import type { TeamStats, Team } from "@/lib/mundialito/domain/types";
function TeamRanking({
  title,
  rows,
  metric,
  label,
}: {
  title: string;
  rows: { team: Team; stats: TeamStats; position: number }[];
  metric: "gf" | "ga" | "discipline";
  label: string;
}) {
  return (
    <section className="sports-panel">
      <h2>{title}</h2>
      {rows.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">POS</th>
                <th scope="col">EQUIPO</th>
                <th scope="col">PJ</th>
                <th scope="col">{label}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.team.slug}>
                  <td>{row.position}</td>
                  <th scope="row">
                    <Link href={`/mundialito/equipos/${row.team.slug}`}>
                      {row.team.name}
                    </Link>
                  </th>
                  <td>{row.stats.played}</td>
                  <td>{row.stats[metric]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <DataEmpty title="Datos pendientes">
          El ranking aparecerá cuando existan registros oficiales suficientes.
        </DataEmpty>
      )}
    </section>
  );
}
export async function Statistics() {
  const snapshot = await getTournament(),
    stats = snapshot.statistics;
  const scorers = stats.eventComplete
    ? stats.scorers
    : stats.recordedScorers.map((row) => ({
        ...row,
        position:
          stats.recordedScorers.findIndex((r) => r.goals === row.goals) + 1,
      }));
  return (
    <>
      <section className="sports-panel scorers-panel">
        <h2>Tabla de goleadores</h2>
        {!stats.eventComplete && (
          <p className="footnote">
            Goles registrados, listado parcial: faltan actas certificadas. Las
            posiciones no son definitivas.
          </p>
        )}
        {scorers.length ? (
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Goleadores, tabla desplazable"
          >
            <table className="data-table">
              <thead>
                <tr>
                  {["POS", "JUGADOR", "EQUIPO", "GOLES", "PJ"].map((label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scorers.map((row) => (
                  <tr key={row.player.id}>
                    <td>{row.position}</td>
                    <th scope="row">
                      <Link href={`/mundialito/jugadores/${row.player.slug}`}>
                        {row.player.name}
                      </Link>
                    </th>
                    <td>
                      <Link href={`/mundialito/equipos/${row.player.teamId}`}>
                        {
                          snapshot.data.teams.find(
                            (t) => t.slug === row.player.teamId,
                          )?.name
                        }
                      </Link>
                    </td>
                    <td>{row.goals}</td>
                    <td>{row.played}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <DataEmpty title="Goleadores por confirmar">
            {stats.eventComplete
              ? "Aún no hay goles de jugadores registrados."
              : "Publicaremos esta tabla cuando las nóminas y los eventos de los partidos estén completos."}
          </DataEmpty>
        )}
        <p className="footnote">
          Solo resultados confirmados. Los autogoles y los goles de tandas no se
          suman al goleador. Los empates de goles comparten posición.
        </p>
        {(stats.recordedOwnGoals.length > 0 ||
          stats.unattributedOwnGoals > 0) && (
          <>
            <h3>Autogoles registrados (separados de goleadores)</h3>
            <ul>
              {stats.recordedOwnGoals.map((r) => (
                <li key={r.player.id}>
                  <Link href={`/mundialito/jugadores/${r.player.slug}`}>
                    {r.player.name}
                  </Link>
                  : {r.ownGoals}
                </li>
              ))}
            </ul>
            {stats.unattributedOwnGoals > 0 && (
              <p>
                {stats.unattributedOwnGoals} autogoles sin autor identificado.
              </p>
            )}
          </>
        )}
      </section>
      <div className="statistics-grid">
        <section className="sports-panel"><h2>Tarjetas registradas por jugador</h2>
          <p className="footnote">Registro provisional. Las cantidades y puntos observados no acreditan actas completas ni desempates disciplinarios definitivos.</p>
          {stats.playerRows.some(r=>r.yellows||r.reds)?<ul>{stats.playerRows.filter(r=>r.yellows||r.reds).map(r=><li key={r.player.id}>
            <Link href={`/mundialito/jugadores/${r.player.slug}`}>{r.player.name}</Link>: {r.yellows} amarillas · {r.reds} expulsiones · {r.observedDiscipline??"causa pendiente"} puntos observados.
          </li>)}</ul>:<p>Sin tarjetas computables en partidos finalizados. No equivale a certificar cero tarjetas.</p>}
        </section>
        <TeamRanking
          title="Equipos más goleadores"
          rows={stats.attack}
          metric="gf"
          label="GF"
        />
        <TeamRanking
          title="Menos goles recibidos"
          rows={stats.defense}
          metric="ga"
          label="GC"
        />
        <TeamRanking
          title="Estadísticas disciplinarias"
          rows={stats.discipline}
          metric="discipline"
          label="PUNTOS DISC."
        />
      </div>
      <section className="sports-panel">
        <h2>Resultados destacados</h2>
        {stats.highlights.length ? (
          <ul className="highlight-list">
            {stats.highlights.map((result) => (
              <li key={result.matchId}>
                <Link href={`/mundialito/partidos/${encodeURIComponent(result.matchId)}`}>
                  {
                    snapshot.data.teams.find(
                      (t) => t.slug === result.homeTeamId,
                    )?.name
                  }{" "}
                  <strong>
                    {result.homeGoals} – {result.awayGoals}
                  </strong>{" "}
                  {
                    snapshot.data.teams.find(
                      (t) => t.slug === result.awayTeamId,
                    )?.name
                  }
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <DataEmpty title="La historia está por escribirse">
            Aquí aparecerán los partidos confirmados con más goles del torneo.
          </DataEmpty>
        )}
      </section>
    </>
  );
}
