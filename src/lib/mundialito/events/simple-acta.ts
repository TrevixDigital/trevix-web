import type { OfficialEvent } from "./model.ts";
import { cardOutcome, type CardState } from "./cards.ts";
import { RosterError, type RosterPlayer } from "../players/model.ts";
import type { MatchValues } from "../matches/model.ts";

export interface PlayerTotals {
  playerId: string | null;
  teamId: string;
  goals: number;
  ownGoals: number;
  yellows: number;
  directReds: number;
}
export interface SimpleBinding {
  id: string;
  operationId: string;
  version: string;
  phase: string;
  values: MatchValues;
  teams: { id: string; name: string }[];
  players: RosterPlayer[];
  goals: OfficialEvent[];
  cards: Record<string, CardState>;
}
export interface SimpleInput {
  status: string;
  home_score: string;
  away_score: string;
  home_penalties: string;
  away_penalties: string;
  totals: PlayerTotals[];
}
export interface SimpleSaveState {
  error: string;
  completed: string[];
  retryOnly?: boolean;
  success?: boolean;
  warnings?: string[];
}
export function playerTotals(binding: Pick<SimpleBinding, "teams" | "players" | "goals" | "cards">): PlayerTotals[] {
  return binding.teams.flatMap(team => [
    ...binding.players.filter(p => p.teamId === team.id).map(p => {
      const cards = binding.cards[p.id]?.events ?? [];
      return {
        playerId: p.id, teamId: team.id,
        goals: binding.goals.filter(e => e.team_id === team.id && e.player_id === p.id && e.event_type === "goal").length,
        ownGoals: binding.goals.filter(e => e.team_id === team.id && e.player_id === p.id && e.event_type === "own_goal").length,
        yellows: cards.filter(e => e.event_type === "yellow_card").length,
        directReds: cards.filter(e => e.event_type === "red_card" && e.dismissal_cause === "direct").length,
      };
    }),
    { playerId: null, teamId: team.id, goals: 0, ownGoals: binding.goals.filter(e => e.team_id === team.id && e.player_id === null && e.event_type === "own_goal").length, yellows: 0, directReds: 0 },
  ]);
}
export function validateTotals(raw: unknown, binding: Pick<SimpleBinding, "teams" | "players" | "goals" | "cards">): PlayerTotals[] {
  const expected = playerTotals(binding);
  if (!Array.isArray(raw) || raw.length !== expected.length)
    throw new RosterError("VALIDATION", "La nómina cambió o está incompleta. Recarga el partido.");
  const seen = new Set<string>();
  return raw.map(row => {
    const e = expected.find(e => e.teamId === row?.teamId && e.playerId === row?.playerId);
    const key = `${row?.teamId}:${row?.playerId}`;
    if (!e || seen.has(key)) throw new RosterError("ROSTER", "Jugador repetido o ajeno a los equipos del partido.");
    seen.add(key);
    for (const field of ["goals", "ownGoals", "yellows", "directReds"] as const)
      if (!Number.isSafeInteger(row[field]) || row[field] < 0 || row[field] > 2147483647)
        throw new RosterError("VALIDATION", "Las cantidades deben ser números enteros no negativos.");
    if (row.playerId === null && (row.goals || row.yellows || row.directReds))
      throw new RosterError("ROSTER", "Solo un autogol puede registrarse sin autor identificado.");
    cardOutcome(row.yellows, row.directReds);
    return { ...e, goals: row.goals, ownGoals: row.ownGoals, yellows: row.yellows, directReds: row.directReds };
  });
}
export function goalTotals(rows: PlayerTotals[], teams: {id: string}[]) {
  return teams.map(team => rows.reduce((n, r) => n + (r.teamId === team.id ? r.goals : r.ownGoals), 0));
}
