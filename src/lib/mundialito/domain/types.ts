import type { GroupId, Team } from "../data/teams.ts";
export type { GroupId, Team };
export type Stage =
  "groups" | "round16" | "quarter" | "semi" | "third-place" | "final";
export type MatchState = "scheduled" | "live" | "confirmed" | "void";
export interface Fixture {
  id: string;
  stage: Stage;
  group?: GroupId;
  homeTeamId?: string;
  awayTeamId?: string;
  startsAt?: string;
  venue?: string;
}
export interface MatchResult {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  state: "live" | "confirmed";
  homeGoals: number;
  awayGoals: number;
  penalties?: { home: number; away: number };
}
export interface Player {
  id: string;
  name: string;
  slug: string;
  teamId: string;
  shirtNumber: number | null;
  position?: string;
  disciplinaryStatus?: string;
}
export type MatchEvent = {
  id: string;
  matchId: string;
  teamId: string;
  playerId: string | null;
  /** Raw database cards without an acta/cause certification. Never official tiebreak points. */
  disciplineUncertified?: boolean;
  /** Explicit sporting cause from the public card snapshot; not a certification. */
  dismissalCause?: "direct" | "second_yellow";
  minute?: number;
  kind: "appearance" | "goal" | "yellow" | "second-yellow" | "red";
  phase?: "regulation" | "shootout";
  ownGoal?: boolean;
};
export interface DrawResolution {
  context: string;
  orderedTeamIds: readonly string[];
  documentReference: string;
}
export interface CommitteeInterpretation {
  reapplyHeadToHead: boolean;
  documentReference: string;
}
export interface AssignmentResolution {
  teamByLeaderGroup: Readonly<Record<"A" | "B" | "C" | "D", string>>;
  documentReference: string;
}
export interface TournamentData {
  teams: readonly Team[];
  fixtures: readonly Fixture[];
  results: readonly MatchResult[];
  players: readonly Player[];
  events: readonly MatchEvent[];
  /** Complete official card audit for BOTH teams, including an explicit zero. */
  disciplineCoverage: readonly string[];
  /** Read-consistent recorded card sets for provisional ranking only; never certification. */
  provisionalDisciplineCoverage?: readonly { matchId: string; teamId: string }[];
  /** Full official goals and appearances; absent coverage means unknown, not zero. */
  eventCoverage: readonly string[];
  draws: readonly DrawResolution[];
  interpretation?: CommitteeInterpretation;
  assignmentResolution?: AssignmentResolution;
  /** Verified by the read adapter against the full sporting basis and all 8 stored pairings. */
  sportingConfirmation?: { id: string; basis: string };
  classificationPolicy?: "sporting";
}
export interface TeamStats {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  discipline: number | null;
  /** Registered-card tiebreak value, kept separate from certified discipline. */
  provisionalDiscipline?: number | null;
}
export type PendingReason =
  | "results"
  | "discipline"
  | "draw"
  | "interpretation"
  | "assignment"
  | "penalties";
export interface RankedTeam {
  team: Team;
  stats: TeamStats;
  position: number | null;
  possiblePositions: number[];
  pending: PendingReason[];
}
export interface GroupStanding {
  group: GroupId;
  rows: RankedTeam[];
  complete: boolean;
  hasResults: boolean;
}
export type PublicationState = "pending" | "provisional" | "confirmed";
export interface Participant {
  label: string;
  teamId?: string;
  state: PublicationState;
  pending: PendingReason[];
}
export interface BracketMatch {
  id: string;
  stage: Exclude<Stage, "groups">;
  home: Participant;
  away: Participant;
  state: PublicationState;
  result?: MatchResult;
  winnerId?: string;
  loserId?: string;
  pending: PendingReason[];
}
export interface ThirdAssignment {
  state: PublicationState;
  byGroup: Partial<Record<GroupId, string>>;
  alternatives: ReadonlyArray<Readonly<Record<string, string>>>;
  pending: PendingReason[];
}
