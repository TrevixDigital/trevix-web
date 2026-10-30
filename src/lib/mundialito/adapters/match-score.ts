import type { Fixture, MatchResult, Stage } from "../domain/types.ts";

/** Pure field contract only. It performs no HTTP requests or database writes. */
export interface SupabaseScoreColumns {
  home_score: number | null;
  away_score: number | null;
  home_penalties: number | null;
  away_penalties: number | null;
}
function score(value: number | null, label: string): number {
  if (value === null || !Number.isSafeInteger(value) || value < 0)
    throw new Error(
      `Marcador ausente o inválido: ${label}. NULL no equivale a cero.`,
    );
  return value;
}
export function fromSupabaseScoreColumns(
  fixture: Fixture,
  fields: SupabaseScoreColumns,
  status: "scheduled" | "live" | "finished",
): MatchResult | undefined {
  // Pending/default values do not constitute a result, including default 0–0.
  if (status === "scheduled") return undefined;
  if (status !== "live" && status !== "finished")
    throw new Error("Estado no compatible con un resultado.");
  if (
    !fixture.homeTeamId ||
    !fixture.awayTeamId ||
    fixture.homeTeamId === fixture.awayTeamId
  )
    throw new Error(
      "No se puede representar un resultado sin dos participantes distintos.",
    );
  const homeGoals = score(fields.home_score, "home_score"),
    awayGoals = score(fields.away_score, "away_score");
  let penalties: MatchResult["penalties"];
  if (fields.home_penalties !== null || fields.away_penalties !== null) {
    if (
      fixture.stage === "groups" ||
      status !== "finished" ||
      homeGoals !== awayGoals
    )
      throw new Error(
        "La tanda solo define un partido eliminatorio finalizado y empatado.",
      );
    const home = score(fields.home_penalties, "home_penalties"),
      away = score(fields.away_penalties, "away_penalties");
    if (home === away)
      throw new Error("Una tanda empatada no determina ganador.");
    penalties = { home, away };
  }
  return {
    matchId: fixture.id,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    state: status === "finished" ? "confirmed" : "live",
    homeGoals,
    awayGoals,
    ...(penalties ? { penalties } : {}),
  };
}
/** Keeps regulation score and shootout columns separate; never emits goal events. */
export function toSupabaseScoreColumns(
  result: MatchResult | undefined,
  stage: Stage,
): SupabaseScoreColumns {
  const fields: SupabaseScoreColumns = {
    home_score: result?.homeGoals ?? null,
    away_score: result?.awayGoals ?? null,
    home_penalties: result?.penalties?.home ?? null,
    away_penalties: result?.penalties?.away ?? null,
  };
  if (result)
    fromSupabaseScoreColumns(
      {
        id: result.matchId,
        stage,
        homeTeamId: result.homeTeamId,
        awayTeamId: result.awayTeamId,
      },
      fields,
      result.state === "confirmed" ? "finished" : "live",
    );
  return fields;
}
