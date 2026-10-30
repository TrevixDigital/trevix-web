import type {
  BracketMatch,
  GroupStanding,
  Participant,
  PendingReason,
  ThirdAssignment,
  TournamentData,
} from "../domain/types.ts";
export const bracketDefinitions = [
  { id: "O1", stage: "round16", home: "1:A", away: "T:A" },
  { id: "O2", stage: "round16", home: "1:B", away: "T:B" },
  { id: "O3", stage: "round16", home: "1:C", away: "T:C" },
  { id: "O4", stage: "round16", home: "1:D", away: "T:D" },
  { id: "O5", stage: "round16", home: "1:E", away: "2:F" },
  { id: "O6", stage: "round16", home: "1:F", away: "2:E" },
  { id: "O7", stage: "round16", home: "2:A", away: "2:D" },
  { id: "O8", stage: "round16", home: "2:B", away: "2:C" },
  { id: "C1", stage: "quarter", home: "W:O1", away: "W:O5" },
  { id: "C2", stage: "quarter", home: "W:O2", away: "W:O6" },
  { id: "C3", stage: "quarter", home: "W:O3", away: "W:O7" },
  { id: "C4", stage: "quarter", home: "W:O4", away: "W:O8" },
  { id: "S1", stage: "semi", home: "W:C1", away: "W:C3" },
  { id: "S2", stage: "semi", home: "W:C2", away: "W:C4" },
  { id: "P3", stage: "third-place", home: "L:S1", away: "L:S2" },
  { id: "F", stage: "final", home: "W:S1", away: "W:S2" },
] as const;
/** Sporting outcome only: shootout goals remain separate from match goals. */
export function knockoutOutcome(home:string|undefined,away:string|undefined,homeGoals:number,awayGoals:number,penalties?:{home:number;away:number}) {
  const winnerId=homeGoals!==awayGoals?(homeGoals>awayGoals?home:away):penalties&&penalties.home!==penalties.away?(penalties.home>penalties.away?home:away):undefined;
  return {winnerId,loserId:winnerId?(winnerId===home?away:home):undefined};
}
export function generateBracket(
  groups: GroupStanding[],
  assignment: ThirdAssignment,
  data: TournamentData,
): BracketMatch[] {
  const matches: BracketMatch[] = [];
  const groupsComplete = groups.every((g) => g.complete);
  function participant(source: string): Participant {
    const [type, value] = source.split(":");
    if (type === "W" || type === "L") {
      const previous = matches.find((m) => m.id === value)!;
      const teamId = type === "W" ? previous.winnerId : previous.loserId;
      return {
        label: `${type === "W" ? "Ganador" : "Perdedor"} ${value}`,
        teamId,
        state: teamId ? "confirmed" : "pending",
        pending: previous.pending.length
          ? previous.pending
          : teamId
            ? []
            : ["results"],
      };
    }
    if (type === "T")
      return {
        label: `T${["A", "B", "C", "D"].indexOf(value) + 1} · tercero asignado`,
        teamId: assignment.byGroup[value as "A"],
        state: assignment.state,
        pending: assignment.pending,
      };
    const group = groups.find((g) => g.group === value)!;
    const row = group.rows.find((r) => r.position === Number(type));
    return {
      label: `${type}.º Grupo ${value}`,
      teamId: row?.team.slug,
      state: row ? (groupsComplete ? "confirmed" : "provisional") : "pending",
      pending: row
        ? []
        : [
            ...new Set(
              group.rows
                .filter((r) => r.possiblePositions.includes(Number(type)))
                .flatMap((r) => r.pending),
            ),
          ],
    };
  }
  for (const definition of bracketDefinitions) {
    const home = participant(definition.home),
      away = participant(definition.away);
    const state =
      home.state === "confirmed" && away.state === "confirmed"
        ? "confirmed"
        : home.teamId && away.teamId
          ? "provisional"
          : "pending";
    const pending: PendingReason[] = [
      ...new Set([...home.pending, ...away.pending]),
    ];
    const result = data.results.find((r) => r.matchId === definition.id);
    const fixture = data.fixtures.find((f) => f.id === definition.id);
    if (fixture && fixture.stage !== definition.stage)
      throw new Error(
        "La fase del calendario no coincide con la llave oficial",
      );
    if (
      result &&
      (state !== "confirmed" ||
        result.homeTeamId !== home.teamId ||
        result.awayTeamId !== away.teamId)
    )
      throw new Error(
        `Resultado ${definition.id} sin participantes confirmados o incompatible con la llave`,
      );
    let winnerId: string | undefined, loserId: string | undefined;
    if (result?.state === "confirmed") {
      ({winnerId,loserId}=knockoutOutcome(home.teamId,away.teamId,result.homeGoals,result.awayGoals,result.penalties));
      if(!winnerId)pending.push("penalties");
    }
    matches.push({
      ...definition,
      home,
      away,
      state,
      result,
      winnerId,
      loserId,
      pending,
    });
  }
  return matches;
}
