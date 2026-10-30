import Link from "next/link";
import { notFound } from "next/navigation";
import { Hero } from "@/components/mundialito/hero";
import {
  getTournament,
  getCalendarReadMetadata,
} from "@/lib/mundialito/repositories/tournament";
import { statusLabels } from "@/lib/mundialito/matches/model";
import { StateBadge, PendingNotice, DataEmpty } from "@/components/mundialito/data-ui";
export const metadata = { title: "Ficha del partido" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    snapshot = await getTournament();
  const fixture = snapshot.data.fixtures.find((f) => f.id === id),
    bracket = snapshot.bracket.find((m) => m.id === id),
    result = snapshot.data.results.find((r) => r.matchId === id);
  if (!fixture && !bracket) notFound();
  const remote = (await getCalendarReadMetadata())?.matches.find(
    (m) => m.localId === id,
  );
  const home = bracket?.home.teamId ?? fixture?.homeTeamId,
    away = bracket?.away.teamId ?? fixture?.awayTeamId;
  const team = (slug: string | undefined, fallback: string) =>
    slug ? (
      <Link href={`/mundialito/equipos/${slug}`}>
        {snapshot.data.teams.find((t) => t.slug === slug)?.name}
      </Link>
    ) : (
      fallback
    );
  const events = snapshot.data.events.filter(
    (e) =>
      e.matchId === id &&
      result?.state === "confirmed" &&
      !(e.kind === "goal" && e.phase === "shootout"),
  );
  return (
    <>
      <Hero compact title="PARTIDO" />
      <section className="shell section">
        <Link href="/mundialito/partidos" className="text-link">
          ← Todos los partidos
        </Link>
        <article className="sports-panel match-detail">
          <header className="panel-title">
            <h2>{remote ? `Partido ${remote.matchNumber}` : id}</h2>
            <StateBadge
              state={
                bracket?.state ??
                (result?.state === "confirmed" ? "confirmed" : "provisional")
              }
            />
          </header>
          <p className="section-description">
            {remote ? `${statusLabels[remote.status]} · ` : ""}
            {fixture?.startsAt
              ? new Intl.DateTimeFormat("es-GT", {
                  timeZone: "America/Guatemala",
                  dateStyle: "full",
                  timeStyle: "short",
                }).format(new Date(fixture.startsAt))
              : "Fecha y horario por confirmar"}{" "}
            · {fixture?.venue ?? "Sede por confirmar"}
          </p>
          <div className="match-score">
            <div>{team(home, bracket?.home.label ?? "Por definir")}</div>
            <strong
              aria-label={
                result
                  ? "Marcador del partido"
                  : "Partido programado sin marcador"
              }
            >
              {result ? `${result.homeGoals} – ${result.awayGoals}` : "VS"}
            </strong>
            <div>{team(away, bracket?.away.label ?? "Por definir")}</div>
          </div>
          {result?.penalties && (
            <p className="penalty-note">
              Partido: {result.homeGoals} – {result.awayGoals} · Tanda de
              penales: {result.penalties.home} – {result.penalties.away}
            </p>
          )}
          <p className="footnote">
            {result?.state === "confirmed"
              ? "Marcador oficial registrado"
              : result?.state === "live"
                ? "En juego · marcador provisional"
                : "Sin resultado oficial"}
            {bracket ? " · Sin prórroga" : ""}
          </p>
          {result?.state === "confirmed" && (
            <p className="footnote">
              El marcador oficial y los goles individuales se registran por separado.
              Una corrección administrativa puede modificar el resultado sin añadir
              goles a los jugadores.
            </p>
          )}
          {bracket && <PendingNotice reasons={bracket.pending} />}
        </article>
        <section className="sports-panel profile-section">
          <h2>Eventos del partido</h2>
          {events.length ? (
            <ul className="event-list">
              {events
                .filter((e) => e.kind !== "appearance")
                .map((e) => (
                  <li key={e.id}>
                    <span>{e.minute !== undefined ? `${e.minute}′` : "—"}</span>
                    {e.playerId ? (
                      <Link
                        href={`/mundialito/jugadores/${snapshot.data.players.find((p) => p.id === e.playerId)?.slug}`}
                      >
                        {
                          snapshot.data.players.find((p) => p.id === e.playerId)
                            ?.name
                        }
                      </Link>
                    ) : (
                      <span>Autor de autogol no identificado</span>
                    )}
                    <span>
                      {e.kind === "goal"
                        ? e.ownGoal
                          ? "Autogol"
                          : "Gol"
                        : e.kind === "yellow"
                          ? "Amarilla"
                          : e.kind === "second-yellow"
                            ? "Expulsión por doble amarilla"
                            : e.disciplineUncertified
                              ? "Roja · causa pendiente"
                              : "Roja directa"}
                    </span>
                  </li>
                ))}
            </ul>
          ) : (
            <DataEmpty title="Eventos pendientes">
              Los goles y las tarjetas aparecerán cuando se registren
              oficialmente.
            </DataEmpty>
          )}
        </section>
      </section>
    </>
  );
}
