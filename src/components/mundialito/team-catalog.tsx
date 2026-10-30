import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { groupIds } from "@/lib/mundialito/data/teams";
import { getTournament } from "@/lib/mundialito/repositories/tournament";

export async function TeamCatalog() {
  const snapshot = await getTournament();
  return (
    <div className="club-catalog">
      {groupIds.map((group) => (
        <section
          key={group}
          className={`club-group group-${group.toLowerCase()}`}
          aria-labelledby={`clubs-${group}`}
        >
          <header className="club-group-heading">
            <h2 id={`clubs-${group}`}>Grupo {group}</h2>
            <span>3 EQUIPOS OFICIALES</span>
          </header>
          <div className="club-cards">
            {snapshot.data.teams
              .filter((t) => t.group === group)
              .map((team) => {
                const stats = snapshot.groups
                  .find((g) => g.group === group)
                  ?.rows.find((r) => r.team.slug === team.slug)?.stats;
                return (
                  <Link
                    key={team.slug}
                    href={`/mundialito/equipos/${team.slug}`}
                    className="club-card"
                  >
                    <span className="club-card-kicker">
                      MUNDIALITO LA BOMBA · 2026
                    </span>
                    <h3>{team.name}</h3>
                    {stats && stats.played > 0 && (
                      <dl className="club-stats">
                        <div>
                          <dt>PJ</dt>
                          <dd>{stats.played}</dd>
                        </div>
                        <div>
                          <dt>Puntos</dt>
                          <dd>{stats.points}</dd>
                        </div>
                        <div>
                          <dt>Goles</dt>
                          <dd>{stats.gf}</dd>
                        </div>
                      </dl>
                    )}
                    <span className="club-card-link">
                      Ver perfil del equipo{" "}
                      <ArrowUpRight size={19} aria-hidden="true" />
                    </span>
                  </Link>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
