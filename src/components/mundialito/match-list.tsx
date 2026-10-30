import Link from "next/link";
import {
  getTournament,
  getCalendarReadMetadata,
} from "@/lib/mundialito/repositories/tournament";
import { groupIds } from "@/lib/mundialito/data/teams";
import { DataEmpty } from "@/components/mundialito/data-ui";
export async function MatchList({
  teamId,
  groupOnly = false,
  mode = "all",
  ids,
}: {
  teamId?: string;
  groupOnly?: boolean;
  mode?: "all" | "results" | "upcoming";
  ids?: readonly string[];
}) {
  const snapshot = await getTournament();
  const metadata = await getCalendarReadMetadata();
  const fixtures = snapshot.data.fixtures.filter((f) => {
    const bracket = snapshot.bracket.find((m) => m.id === f.id),
      result = snapshot.data.results.find((r) => r.matchId === f.id);
    const status = metadata?.matches.find((m) => m.localId === f.id)?.status;
    const participants = [
      bracket?.home.teamId ?? f.homeTeamId,
      bracket?.away.teamId ?? f.awayTeamId,
    ];
    return (
      (!groupOnly || f.stage === "groups") &&
      (!teamId || participants.includes(teamId)) &&
      (!ids || ids.includes(f.id)) &&
      (mode === "all" ||
        (mode === "results"
          ? result?.state === "confirmed"
          : status
            ? status === "scheduled"
            : result?.state !== "confirmed"))
    );
  });
  if (!fixtures.length)
    return (
      <DataEmpty
        title={
          mode === "results"
            ? "Resultados pendientes"
            : "Calendario por confirmar"
        }
      >
        Los encuentros oficiales aparecerán aquí cuando sean publicados por la
        organización.
      </DataEmpty>
    );
  const names = new Map(snapshot.data.teams.map((t) => [t.slug, t.name]));
  const rows = (list: typeof fixtures) => (
    <ul className="match-list">
      {list.map((f) => {
        const bracket = snapshot.bracket.find((m) => m.id === f.id),
          result = snapshot.data.results.find((r) => r.matchId === f.id);
        const status = metadata?.matches.find(
          (m) => m.localId === f.id,
        )?.status;
        const home = bracket?.home.teamId ?? f.homeTeamId,
          away = bracket?.away.teamId ?? f.awayTeamId;
        return (
          <li key={f.id}>
            <Link href={`/mundialito/partidos/${encodeURIComponent(f.id)}`}>
              <span className="match-date">
                {f.startsAt
                  ? new Intl.DateTimeFormat("es-GT", {
                      timeZone: "America/Guatemala",
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(f.startsAt))
                  : "Fecha por confirmar"}
              </span>
              <span className="match-names">
                {home
                  ? names.get(home)
                  : (bracket?.home.label ?? "Por definir")}
                <strong
                  aria-label={
                    result
                      ? "Marcador del partido"
                      : !status || status === "scheduled"
                        ? "Partido programado sin marcador"
                        : "Partido sin marcador oficial"
                  }
                >
                  {result ? `${result.homeGoals} – ${result.awayGoals}` : "VS"}
                </strong>
                {away
                  ? names.get(away)
                  : (bracket?.away.label ?? "Por definir")}
              </span>
              <span>
                {status
                  ? {
                      scheduled: "Programado",
                      live: "En juego",
                      finished:
                        result?.state === "confirmed"
                          ? "Finalizado"
                          : "Finalizado · Resultado pendiente de importación",
                      postponed: "Aplazado",
                      cancelled: "Cancelado",
                      suspended: "Suspendido",
                    }[status]
                  : result?.state === "confirmed"
                    ? "Finalizado"
                    : result?.state === "live"
                      ? "En juego"
                      : "Próximo"}
                {result?.penalties
                  ? ` · Penales ${result.penalties.home}–${result.penalties.away}`
                  : ""}{" "}
                · {f.venue ?? "Sede por confirmar"}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
  return groupOnly ? (
    <>
      {groupIds
        .filter((g) => fixtures.some((f) => f.group === g))
        .map((group) => (
          <section key={group}>
            <h3>Grupo {group}</h3>
            {rows(fixtures.filter((f) => f.group === group))}
          </section>
        ))}
    </>
  ) : (
    rows(fixtures)
  );
}
