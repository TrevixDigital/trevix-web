import type { GroupId, Stage } from "../domain/types.ts";
/** Exact values confirmed by the tournament owner. No fuzzy parsing or ordinal inference. */
export const TOURNAMENT_SLUG = "mundialito-la-bomba-2026";
// Exact remote slugs observed in the real read. Names and groups must still match.
// Public routes keep the existing official slugs; remote values remain in metadata.
export const TEAM_SLUG_ALIASES: Readonly<Record<string, string>> = {
  "segunda-la-bomba": "2da-la-bomba",
  "segunda-del-sagrado": "2da-del-sagrado",
};
export const MATCH_PHASES: Readonly<Record<string, Stage>> = {
  groups: "groups",
  round_of_16: "round16",
  quarterfinals: "quarter",
  semifinals: "semi",
  third_place: "third-place",
  final: "final",
};
export const MATCHDAY_PHASES: Readonly<Record<string, readonly Stage[]>> = {
  groups: ["groups"],
  round_of_16: ["round16"],
  quarterfinals: ["quarter"],
  semifinals: ["semi"],
  finals: ["third-place", "final"],
};
// Accept two explicit group-name spellings; unknown names remain errors.
export const GROUP_NAMES: Readonly<Record<string, GroupId>> = {
  A: "A",
  B: "B",
  C: "C",
  D: "D",
  E: "E",
  F: "F",
  "Grupo A": "A",
  "Grupo B": "B",
  "Grupo C": "C",
  "Grupo D": "D",
  "Grupo E": "E",
  "Grupo F": "F",
};
export const STATUSES = [
  "scheduled",
  "live",
  "finished",
  "postponed",
  "cancelled",
  "suspended",
] as const;
export const KNOCKOUT_MATCHES: Readonly<
  Record<number, { code: string; localId: string; stage: Stage }>
> = {
  19: { code: "O1", localId: "O1", stage: "round16" },
  20: { code: "O2", localId: "O2", stage: "round16" },
  21: { code: "O3", localId: "O3", stage: "round16" },
  22: { code: "O4", localId: "O4", stage: "round16" },
  23: { code: "O5", localId: "O5", stage: "round16" },
  24: { code: "O6", localId: "O6", stage: "round16" },
  25: { code: "O7", localId: "O7", stage: "round16" },
  26: { code: "O8", localId: "O8", stage: "round16" },
  27: { code: "C1", localId: "C1", stage: "quarter" },
  28: { code: "C2", localId: "C2", stage: "quarter" },
  29: { code: "C3", localId: "C3", stage: "quarter" },
  30: { code: "C4", localId: "C4", stage: "quarter" },
  31: { code: "S1", localId: "S1", stage: "semi" },
  32: { code: "S2", localId: "S2", stage: "semi" },
  33: { code: "THIRD", localId: "P3", stage: "third-place" },
  34: { code: "FINAL", localId: "F", stage: "final" },
};
export const SOURCE_REFERENCES: Readonly<Record<string, string>> = {
  "1A": "1:A",
  "1B": "1:B",
  "1C": "1:C",
  "1D": "1:D",
  "1E": "1:E",
  "1F": "1:F",
  "2A": "2:A",
  "2B": "2:B",
  "2C": "2:C",
  "2D": "2:D",
  "2E": "2:E",
  "2F": "2:F",
  T1: "T:A",
  T2: "T:B",
  T3: "T:C",
  T4: "T:D",
  "WIN:O1": "W:O1",
  "WIN:O2": "W:O2",
  "WIN:O3": "W:O3",
  "WIN:O4": "W:O4",
  "WIN:O5": "W:O5",
  "WIN:O6": "W:O6",
  "WIN:O7": "W:O7",
  "WIN:O8": "W:O8",
  "WIN:C1": "W:C1",
  "WIN:C2": "W:C2",
  "WIN:C3": "W:C3",
  "WIN:C4": "W:C4",
  "WIN:S1": "W:S1",
  "WIN:S2": "W:S2",
  "LOSE:S1": "L:S1",
  "LOSE:S2": "L:S2",
};
