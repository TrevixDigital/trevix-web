import type {
  RankedTeam,
  ThirdAssignment,
  TournamentData,
} from "../domain/types.ts";
export function permutations<T>(values: readonly T[]): T[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, i) =>
    permutations(values.filter((_, index) => i !== index)).map((rest) => [
      value,
      ...rest,
    ]),
  );
}
/** Exhaustive search (4! = 24), then lexicographic Art.12 priority by THIRD rank. */
export function assignThirds(
  leaders: RankedTeam[],
  thirds: RankedTeam[],
  data: TournamentData,
  complete: boolean,
): ThirdAssignment {
  const selected = thirds.filter((t) =>
    t.possiblePositions.every((p) => p <= 4),
  );
  if (
    leaders.length !== 4 ||
    selected.length !== 4 ||
    [...leaders, ...selected].some((r) => r.position === null)
  )
    return {
      state: "pending",
      byGroup: {},
      alternatives: [],
      pending: [
        ...new Set(
          [...leaders, ...thirds]
            .flatMap((r) => r.pending)
            .concat("assignment"),
        ),
      ],
    };
  const valid = permutations(selected).filter((assignment) =>
    assignment.every((third, i) => third.team.group !== leaders[i].team.group),
  );
  const vector = (assignment: RankedTeam[]) =>
    [...selected]
      .sort((a, b) => a.position! - b.position!)
      .map(
        (third) =>
          leaders[assignment.findIndex((t) => t.team.slug === third.team.slug)]
            .position!,
      );
  const compare = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
  };
  const ordered = valid.sort((a, b) => compare(vector(a), vector(b)));
  const best = ordered.length
    ? ordered.filter((a) => compare(vector(a), vector(ordered[0])) === 0)
    : [];
  const alternatives = best.map((assignment) =>
    Object.fromEntries(
      leaders.map((leader, i) => [leader.team.group, assignment[i].team.slug]),
    ),
  );
  const resolution = data.assignmentResolution;
  let chosen = alternatives.length === 1 ? alternatives[0] : undefined;
  if (resolution) {
    if (!resolution.documentReference.trim())
      throw new Error("Asignación sin acta del Comité");
    chosen = alternatives.find((a) =>
      ["A", "B", "C", "D"].every(
        (g) =>
          a[g] === resolution.teamByLeaderGroup[g as "A" | "B" | "C" | "D"],
      ),
    );
    if (!chosen)
      throw new Error(
        "La resolución contradice las prioridades del artículo 12 o repite grupo",
      );
  }
  if (!chosen)
    return {
      state: "pending",
      byGroup: {},
      alternatives,
      pending: [alternatives.length ? "draw" : "assignment"],
    };
  return {
    state: complete ? "confirmed" : "provisional",
    byGroup: chosen,
    alternatives,
    pending: [],
  };
}
