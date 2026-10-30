import type { MatchEvent } from "../domain/types.ts";
/** Score each player's sanction per match, never count the yellow pair twice. */
export function disciplineSummary(events: readonly MatchEvent[]): {
  points: number | null;
  yellows: number;
  reds: number;
} {
  const sanctions = new Map<string, MatchEvent[]>();
  for (const event of events) {
    if (!["yellow", "second-yellow", "red"].includes(event.kind)) continue;
    const key = `${event.matchId}:${event.playerId}`;
    sanctions.set(key, [...(sanctions.get(key) ?? []), event]);
  }
  let total = 0;
  let yellowCount = 0,
    redCount = 0;
  for (const list of sanctions.values()) {
    const yellows = list.filter((e) => e.kind === "yellow").length;
    const second = list.filter((e) => e.kind === "second-yellow").length;
    const reds = list.filter((e) => e.kind === "red").length;
    if (list.some((e) => e.disciplineUncertified)) {
      yellowCount += yellows;
      redCount += reds + second;
      continue;
    }
    if (
      second > 1 ||
      reds > 1 ||
      yellows > 2 ||
      (second && reds) ||
      (yellows > 1 && reds)
    )
      throw new Error("Registro disciplinario incompatible");
    total += second || yellows === 2 ? 3 : yellows + reds * 4;
    yellowCount += second ? 2 : yellows;
    redCount += second || yellows === 2 ? 1 : reds;
  }
  return {
    points: events.some((e) => e.disciplineUncertified) ? null : total,
    yellows: yellowCount,
    reds: redCount,
  };
}
export function disciplinePoints(events: readonly MatchEvent[]): number | null {
  return disciplineSummary(events).points;
}
/** Observed display and provisional ordering only; never certification or automatic sanctions. */
export function observedDisciplineSummary(events: readonly MatchEvent[]) {
  const ambiguous=events.some(e=>e.kind==="red"&&e.disciplineUncertified&&e.dismissalCause!=="direct");
  const cards=events.filter(e=>["yellow","red","second-yellow"].includes(e.kind));
  try {
    const summary=disciplineSummary(cards.map(e=>({...e,disciplineUncertified:false})));
    return {...summary,points:ambiguous?null:summary.points};
  } catch {
    const summary=disciplineSummary(cards.map(e=>({...e,disciplineUncertified:true})));
    return {...summary,points:null};
  }
}
