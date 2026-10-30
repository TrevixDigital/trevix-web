import { teams as officialTeams } from "../data/teams.ts";
import type { TournamentData } from "../domain/types.ts";
import { disciplinePoints } from "./discipline.ts";
import { bracketDefinitions } from "./bracket.ts";
const integer = (value: number) => Number.isSafeInteger(value) && value >= 0;
function unique(values: readonly string[], label: string) {
  if (new Set(values).size !== values.length)
    throw new Error(`${label}: identificadores duplicados`);
}
export function validateTournamentData(data: TournamentData): void {
  if (
    data.teams.length !== 18 ||
    officialTeams.some(
      (t) =>
        !data.teams.some(
          (v) => v.slug === t.slug && v.name === t.name && v.group === t.group,
        ),
    )
  )
    throw new Error(
      "El catálogo debe contener exclusivamente los 18 equipos oficiales",
    );
  unique(
    data.teams.map((t) => t.slug),
    "Equipos",
  );
  unique(
    data.fixtures.map((f) => f.id),
    "Calendario",
  );
  unique(
    data.results.map((r) => r.matchId),
    "Resultados",
  );
  unique(
    data.players.map((p) => p.id),
    "Jugadores",
  );
  unique(
    data.players.map((p) => p.slug),
    "Perfiles",
  );
  unique(
    data.events.map((e) => e.id),
    "Eventos",
  );
  unique(data.disciplineCoverage, "Cobertura disciplinaria");
  unique(data.eventCoverage, "Cobertura de eventos");
  const ids = data.teams.map((t) => t.slug),
    pairs = new Set<string>();
  for (const fixture of data.fixtures) {
    if (
      fixture.stage !== "groups" &&
      !bracketDefinitions.some(
        (definition) =>
          definition.id === fixture.id && definition.stage === fixture.stage,
      )
    )
      throw new Error(
        "El calendario eliminatorio debe usar las llaves oficiales",
      );
    if (
      (fixture.homeTeamId && !ids.includes(fixture.homeTeamId)) ||
      (fixture.awayTeamId && !ids.includes(fixture.awayTeamId)) ||
      (fixture.homeTeamId && fixture.homeTeamId === fixture.awayTeamId)
    )
      throw new Error("Participantes de calendario inválidos");
    if (fixture.startsAt && !Number.isFinite(Date.parse(fixture.startsAt)))
      throw new Error("Fecha de partido inválida");
    if (fixture.stage === "groups") {
      const pair = [fixture.homeTeamId, fixture.awayTeamId].sort().join(":");
      if (
        !fixture.homeTeamId ||
        !fixture.awayTeamId ||
        !fixture.group ||
        ![fixture.homeTeamId, fixture.awayTeamId].every(
          (id) =>
            data.teams.find((t) => t.slug === id)?.group === fixture.group,
        ) ||
        pairs.has(pair)
      )
        throw new Error("Cruce de grupo inválido o duplicado");
      pairs.add(pair);
    }
  }
  for (const result of data.results) {
    if (!["live", "confirmed"].includes(result.state))
      throw new Error("Estado de resultado inválido");
    const fixture = data.fixtures.find((f) => f.id === result.matchId);
    if (
      !fixture ||
      !ids.includes(result.homeTeamId) ||
      !ids.includes(result.awayTeamId) ||
      result.homeTeamId === result.awayTeamId ||
      !integer(result.homeGoals) ||
      !integer(result.awayGoals)
    )
      throw new Error("Resultado inválido o sin calendario");
    if (
      (fixture.homeTeamId && fixture.homeTeamId !== result.homeTeamId) ||
      (fixture.awayTeamId && fixture.awayTeamId !== result.awayTeamId)
    )
      throw new Error(
        "El resultado no corresponde a los participantes del calendario",
      );
    if (
      result.penalties &&
      (fixture.stage === "groups" ||
        result.homeGoals !== result.awayGoals ||
        !integer(result.penalties.home) ||
        !integer(result.penalties.away) ||
        result.penalties.home === result.penalties.away ||
        result.state !== "confirmed")
    )
      throw new Error("Tanda de penales inválida");
  }
  for (const player of data.players)
    if (
      !ids.includes(player.teamId) ||
      !player.id.trim() ||
      !player.slug.endsWith(`--${player.id}`) ||
      !player.name.trim() ||
      (player.shirtNumber !== null &&
        (!integer(player.shirtNumber) || player.shirtNumber < 1))
    )
      throw new Error("Jugador o identificador inválido");
  for (const event of data.events) {
    if (
      !["appearance", "goal", "yellow", "second-yellow", "red"].includes(
        event.kind,
      ) ||
      (event.phase !== undefined &&
        !["regulation", "shootout"].includes(event.phase)) ||
      (event.ownGoal && event.kind !== "goal")
    )
      throw new Error("Tipo de evento inválido");
    const fixture = data.fixtures.find((f) => f.id === event.matchId),
      result = data.results.find((r) => r.matchId === event.matchId);
    const participants = [
      result?.homeTeamId ?? fixture?.homeTeamId,
      result?.awayTeamId ?? fixture?.awayTeamId,
    ];
    if (
      !fixture ||
      !participants.includes(event.teamId) ||
      (event.playerId === null
        ? !event.ownGoal
        : data.players.find((p) => p.id === event.playerId)?.teamId !==
          event.teamId) ||
      (event.minute !== undefined && !integer(event.minute))
    )
      throw new Error("Evento sin partido, jugador o equipo válido");
    if (
      event.phase === "shootout" &&
      (event.kind !== "goal" || fixture.stage === "groups")
    )
      throw new Error("Evento de tanda inválido");
  }
  for (const matchId of [...data.disciplineCoverage, ...data.eventCoverage])
    if (
      !data.results.some(
        (r) => r.matchId === matchId && r.state === "confirmed",
      )
    )
      throw new Error("Cobertura certificada sin resultado confirmado");
  for (const matchId of data.disciplineCoverage)
    if (
      data.events.some((e) => e.matchId === matchId && e.disciplineUncertified)
    )
      throw new Error(
        "No se puede certificar disciplina con causas o actas pendientes.",
      );
  const provisionalKeys=new Set<string>();
  for(const c of data.provisionalDisciplineCoverage??[]) {
    const key=`${c.matchId}:${c.teamId}`;
    const result=data.results.find(r=>r.matchId===c.matchId&&r.state==="confirmed");
    if(provisionalKeys.has(key)||!result||![result.homeTeamId,result.awayTeamId].includes(c.teamId))
      throw new Error("Cobertura disciplinaria provisional inválida");
    provisionalKeys.add(key);
  }
  for (const matchId of data.eventCoverage) {
    const result = data.results.find((r) => r.matchId === matchId)!;
    for (const [teamId, expected] of [
      [result.homeTeamId, result.homeGoals],
      [result.awayTeamId, result.awayGoals],
    ] as const) {
      const goals = data.events.filter(
        (e) =>
          e.matchId === matchId &&
          e.kind === "goal" &&
          e.phase !== "shootout" &&
          (e.ownGoal ? e.teamId !== teamId : e.teamId === teamId),
      ).length;
      if (goals !== expected)
        throw new Error(
          "Los eventos oficiales de gol no coinciden con el marcador reglamentario",
        );
    }
  }
  disciplinePoints(data.events);
  for (const draw of data.draws)
    if (
      !draw.documentReference.trim() ||
      draw.orderedTeamIds.some((id) => !ids.includes(id)) ||
      new Set(draw.orderedTeamIds).size !== draw.orderedTeamIds.length
    )
      throw new Error("Sorteo no documentado o inválido");
  if (data.interpretation && !data.interpretation.documentReference.trim())
    throw new Error("Interpretación sin resolución documentada");
}
