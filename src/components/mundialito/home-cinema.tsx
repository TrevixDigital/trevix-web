import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock3, MapPin } from "lucide-react";
import { getCalendar, getTournament } from "@/lib/mundialito/repositories/tournament";
import { groupIds } from "@/lib/mundialito/data/teams";
import { assetPath } from "@/lib/mundialito/site";
import { DataEmpty } from "@/components/mundialito/data-ui";

const dateFormat = new Intl.DateTimeFormat("es-GT", {
  timeZone: "UTC",
  dateStyle: "long",
});
const timeFormat = new Intl.DateTimeFormat("es-GT", {
  timeZone: "America/Guatemala",
  hour: "numeric",
  minute: "2-digit",
});

/** Home-only presentation. Calendar decisions and all identities stay in the repository. */
export async function HomeCinema() {
  const [calendar, snapshot] = await Promise.all([
    getCalendar(),
    getTournament(),
  ]);
  const next = calendar.next;
  const matches = next?.matches.filter((m) => m.status === "scheduled") ?? [];
  const names = new Map(
    snapshot.data.teams.map((team) => [team.slug, team.name]),
  );
  return (
    <div className="home-cinema">
      <section
        className="home-fixtures-scene"
        aria-labelledby="home-next-title"
      >
        <Image
          className="home-fixtures-backdrop"
          src={assetPath("/images/football-real/field-desktop.webp")}
          alt=""
          fill
          sizes="100vw"
          quality={75}
        />
        <div className="shell home-fixtures-panel">
          <header className="home-fixtures-heading">
            <div className="home-jornada-title">
              <CalendarDays size={30} aria-hidden="true" />
              <div>
                <p className="home-eyebrow">PRÓXIMA FECHA</p>
                <h2 id="home-next-title">
                  {next?.number != null ? (
                    <>
                      Jornada <span>{next.number}</span>
                    </>
                  ) : (
                    "Próxima jornada"
                  )}
                </h2>
              </div>
            </div>
            <div className="home-fixtures-date">
              <span className="home-official-label">PROGRAMACIÓN OFICIAL</span>
              {next && (
                <p>
                  {next.date ? (
                    <time dateTime={next.date}>
                      {dateFormat.format(new Date(`${next.date}T12:00:00Z`))}
                    </time>
                  ) : (
                    "Fecha por confirmar"
                  )}
                </p>
              )}
            </div>
          </header>
          {matches.length ? (
            <ul className="home-fixture-cards">
              {matches.map((match) => {
                const fixture = snapshot.data.fixtures.find(
                  (f) => f.id === match.id,
                )!;
                const bracket = snapshot.bracket.find((b) => b.id === match.id);
                const homeId = bracket?.home.teamId ?? fixture.homeTeamId;
                const awayId = bracket?.away.teamId ?? fixture.awayTeamId;
                const result = snapshot.data.results.find(
                  (r) => r.matchId === match.id && r.state === "confirmed",
                );
                return (
                  <li key={match.id}>
                    <Link
                      className="home-fixture-card"
                      href={`/mundialito/partidos/${encodeURIComponent(match.id)}`}
                    >
                      <span className="home-fixture-time">
                        <Clock3 size={15} aria-hidden="true" />
                        {fixture.startsAt ? (
                          <time dateTime={fixture.startsAt}>
                            {timeFormat.format(new Date(fixture.startsAt))}
                          </time>
                        ) : (
                          "Hora por confirmar"
                        )}
                      </span>
                      <span className="home-fixture-pair">
                        <span>
                          {homeId
                            ? names.get(homeId)
                            : (bracket?.home.label ?? "Por definir")}
                        </span>
                        <strong
                          aria-label={
                            result
                              ? "Marcador oficial"
                              : "Partido programado sin marcador"
                          }
                        >
                          {result
                            ? `${result.homeGoals} – ${result.awayGoals}`
                            : "VS"}
                        </strong>
                        <span>
                          {awayId
                            ? names.get(awayId)
                            : (bracket?.away.label ?? "Por definir")}
                        </span>
                      </span>
                      <span className="home-fixture-venue">
                        <MapPin size={12} aria-hidden="true" />
                        {fixture.venue ?? "Sede por confirmar"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <DataEmpty title="Sin próxima fecha programada">
              Los próximos encuentros aparecerán cuando exista una fecha oficial
              programada. El calendario completo conserva los partidos
              pendientes.
            </DataEmpty>
          )}
          <Link href="/mundialito/partidos" className="home-calendar-link">
            Ver calendario completo <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section
        className="shell home-protagonists"
        aria-labelledby="home-groups-title"
      >
        <header className="home-section-heading">
          <div>
            <p className="home-eyebrow">LOS PROTAGONISTAS</p>
            <h2 id="home-groups-title">
              Nuestra gente. <span>Nuestros equipos.</span>
            </h2>
            <p>
              Seis grupos listos para escribir una nueva historia en La Bomba.
            </p>
          </div>
          <Link href="/mundialito/grupos" className="home-calendar-link">
            Ver fase de grupos <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </header>
        <div className="home-groups-grid">
          {groupIds.map((group) => (
            <article
              className={`home-group-card group-${group.toLowerCase()}`}
              key={group}
            >
              <Image
                className="home-group-art"
                src={assetPath("/images/football-real/field-desktop.webp")}
                alt=""
                fill
                sizes="720px"
                quality={75}
              />
              <span className="home-group-letter" aria-hidden="true">
                {group}
              </span>
              <h3>
                <Link href={`/mundialito/grupos#grupo-${group.toLowerCase()}`}>
                  Grupo {group}
                  <ArrowRight size={17} aria-hidden="true" />
                </Link>
              </h3>
              <ul>
                {snapshot.data.teams
                  .filter((team) => team.group === group)
                  .map((team) => (
                    <li key={team.slug}>
                      <Link href={`/mundialito/equipos/${team.slug}`}>{team.name}</Link>
                    </li>
                  ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section
        className="shell home-finale"
        aria-labelledby="home-finale-title"
      >
        <picture className="home-finale-art">
          <source
            media="(max-width: 600px)"
            srcSet={assetPath("/images/football-real/field-mobile.webp")}
          />
          <Image
            src={assetPath("/images/football-real/field-desktop.webp")}
            alt=""
            fill
            sizes="(max-width: 600px) 94vw, 1380px"
            quality={75}
          />
        </picture>
        <div className="home-finale-copy">
          <p className="home-eyebrow">CADA PARTIDO, UNA HISTORIA</p>
          <h2 id="home-finale-title">
            El torneo <span>se vive aquí.</span>
          </h2>
          <p>
            El calendario, los resultados y la clasificación tendrán su lugar en
            esta casa del fútbol.
          </p>
        </div>
        <Link href="/mundialito/partidos" className="home-explore-button">
          Explorar partidos <ArrowRight size={21} aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
