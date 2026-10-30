import Link from "next/link";
import { getCompetitionReport } from "@/lib/mundialito/repositories/tournament";
import { publishedState } from "@/lib/mundialito/domain/publication-state";
import { StateBadge, PendingNotice } from "@/components/mundialito/data-ui";
import type { BracketMatch, Participant } from "@/lib/mundialito/domain/types";
function Side({
  participant,
  score,
  winning,
  names,
}: {
  participant: Participant;
  score?: number;
  winning: boolean;
  names: Map<string, string>;
}) {
  return (
    <div className={`bracket-side ${winning ? "bracket-winner" : ""}`}>
      <div>
        <small>{participant.label}</small>
        {participant.teamId ? (
          <Link href={`/mundialito/equipos/${participant.teamId}`}>
            {names.get(participant.teamId)}
          </Link>
        ) : (
          <span>Por definir</span>
        )}
      </div>
      <strong>{score ?? "—"}</strong>
    </div>
  );
}
function MatchCard({
  match,
  names,
  official,
}: {
  match: BracketMatch;
  names: Map<string, string>;
  official:boolean;
}) {
  return (
    <article
      className={`bracket-card ${match.stage === "final" ? "grand-final" : ""}`}
    >
      <header>
        <Link href={`/mundialito/partidos/${match.id}`}>
          {match.id === "F"
            ? "GRAN FINAL"
            : match.id === "P3"
              ? "TERCER LUGAR"
              : match.id}
        </Link>
        <StateBadge state={match.state==="confirmed"&&!official?"provisional":match.state} />
      </header>
      <Side
        participant={match.home}
        score={match.result?.homeGoals}
        winning={match.winnerId === match.home.teamId && !!match.winnerId}
        names={names}
      />
      <Side
        participant={match.away}
        score={match.result?.awayGoals}
        winning={match.winnerId === match.away.teamId && !!match.winnerId}
        names={names}
      />
      {match.result?.penalties && (
        <p className="penalty-note">
          Partido: {match.result.homeGoals} – {match.result.awayGoals} ·
          Penales: {match.result.penalties.home} – {match.result.penalties.away}
        </p>
      )}
      <PendingNotice reasons={match.pending} />
      <footer>
        <Link href={`/mundialito/partidos/${match.id}`}>Ficha del partido →</Link>
        {match.result?.state === "confirmed"
          ? match.winnerId
            ? "Finalizado"
            : "Desempate pendiente"
          : match.result?.state === "live"
            ? "En juego"
            : "Sin resultado"}
      </footer>
    </article>
  );
}
export async function Bracket({ final = false }: { final?: boolean }) {
  const visualOrder = ["O1", "O5", "O2", "O6", "O3", "O7", "O4", "O8"];
  const report = await getCompetitionReport(),snapshot=report.calculation,
    names = new Map(snapshot.data.teams.map((t) => [t.slug, t.name]));
  const rounds = final
    ? [
        ["Semifinales", "semi"],
        ["Tercer lugar", "third-place"],
        ["Gran final", "final"],
      ]
    : [
        ["Octavos de final", "round16"],
        ["Cuartos de final", "quarter"],
      ];
  return (
    <>
      {!final && (
        <div className="competition-note">
          <StateBadge
            state={
              publishedState(snapshot.complete ? snapshot.assignment.state : "provisional",report.publication)
            }
          />
          <p>
            {snapshot.complete
              ? snapshot.assignment.state === "confirmed"
                ? report.publication.status==="official"?"Clasificados y octavos confirmados según los artículos 11 y 12.":"Asignaciones calculadas según los artículos 11 y 12; pendientes de confirmación deportiva desde el administrador."
                : "Llaves sujetas a desempates y asignaciones oficiales pendientes."
              : "Proyecciones provisionales. Los participantes se confirmarán al finalizar los grupos y resolver los desempates."}
          </p>
          <PendingNotice reasons={snapshot.assignment.pending} />
        </div>
      )}
      <div className={`bracket-layout ${final ? "final-bracket" : ""}`}>
        {rounds.map(([label, stage]) => (
          <section key={stage} className="bracket-round">
            <h2>{label}</h2>
            <div>
              {snapshot.bracket
                .filter((m) => m.stage === stage)
                .sort((a, b) =>
                  stage === "round16"
                    ? visualOrder.indexOf(a.id) - visualOrder.indexOf(b.id)
                    : 0,
                )
                .map((match) => (
                  <MatchCard key={match.id} match={match} names={names} official={report.operations.find(o=>o.matchId===match.id)?.canPublishOfficial===true} />
                ))}
            </div>
          </section>
        ))}
      </div>
      <p className="footnote">
        Sin prórroga. En caso de empate, tanda de penales. Sus goles no se suman
        a la diferencia de goles ni a los goleadores.
        Las proyecciones calculadas se distinguen de los emparejamientos confirmados desde el administrador.
      </p>
    </>
  );
}
