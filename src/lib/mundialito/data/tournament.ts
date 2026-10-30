import { teams } from "./teams.ts";
import { fixtures } from "./calendar.ts";
import { players } from "./players.ts";
import { results } from "./results.ts";
import { events, disciplineCoverage, eventCoverage } from "./events.ts";
import { draws, interpretation, assignmentResolution } from "./committee.ts";
import type { TournamentData } from "../domain/types.ts";
export const tournamentData: TournamentData = {
  teams,
  fixtures,
  players,
  results,
  events,
  disciplineCoverage,
  eventCoverage,
  draws,
  interpretation,
  assignmentResolution,
};
