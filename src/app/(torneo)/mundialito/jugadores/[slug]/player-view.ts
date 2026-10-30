import type { CalendarDay } from "@/lib/mundialito/calendar";
import type { calculateTournament } from "@/lib/mundialito/engine/tournament";
import { observedDisciplineSummary } from "@/lib/mundialito/engine/discipline";
import type { RosterPlayer } from "@/lib/mundialito/players/model";
import type { MatchEvent } from "@/lib/mundialito/domain/types";

export interface PlayerProfileProps {
  player: RosterPlayer;
  teamSlug: string;
  snapshot: ReturnType<typeof calculateTournament>;
  calendar: { days: CalendarDay[] };
}

/** Presentation of existing statistics, never an inference of lineup appearances. */
export function playerView({ player, teamSlug, snapshot, calendar }: PlayerProfileProps) {
  const team = snapshot.data.teams.find(t => t.slug === teamSlug)!;
  const stats = snapshot.statistics.playerRows.find(r => r.player.id === player.id);
  const results = snapshot.data.results.filter(r => r.state === "confirmed" && [r.homeTeamId, r.awayTeamId].includes(teamSlug));
  const hasRecords = (stats?.played ?? 0) > 0;
  const goalsCovered = results.length > 0 && results.every(r => snapshot.data.eventCoverage.includes(r.matchId));
  const cardsCovered = results.length > 0 && results.every(r => snapshot.data.disciplineCoverage.includes(r.matchId) || snapshot.data.provisionalDisciplineCoverage?.some(c => c.matchId === r.matchId && c.teamId === teamSlug));
  const values = {
    played: hasRecords ? stats!.played : goalsCovered ? 0 : null,
    goals: hasRecords || goalsCovered ? stats?.goals ?? 0 : null,
    yellows: hasRecords || cardsCovered ? stats?.yellows ?? 0 : null,
    reds: hasRecords || cardsCovered ? stats?.reds ?? 0 : null,
    points: hasRecords || cardsCovered ? stats?.observedDiscipline ?? null : null,
  };
  const ownGoals = hasRecords || goalsCovered ? stats?.ownGoals ?? 0 : null;
  const rows = snapshot.statistics.playerRows.filter(r => r.player.teamId === teamSlug);
  const shares = ([
    { label: "Goles", value: values.goals, total: rows.reduce((n, r) => n + r.goals, 0), unit: "goles atribuidos" },
    { label: "Amarillas", value: values.yellows, total: rows.reduce((n, r) => n + r.yellows, 0), unit: "amarillas registradas" },
    { label: "Expulsiones", value: values.reds, total: rows.reduce((n, r) => n + r.reds, 0), unit: "expulsiones registradas" },
  ]).map(s => ({ ...s, percent: s.value !== null && s.total > 0 ? s.value / s.total * 100 : null }));
  const events = snapshot.data.events.filter(e => e.playerId === player.id && results.some(r => r.matchId === e.matchId));
  const history = (stats?.matchIds ?? []).flatMap(id => {
    const result = results.find(r => r.matchId === id), fixture = snapshot.data.fixtures.find(f => f.id === id);
    if (!result || !fixture) return [];
    const day = calendar.days.find(d => d.matches.some(m => m.id === id));
    const scheduled = day?.matches.find(m => m.id === id);
    const home = result.homeTeamId === teamSlug;
    const rival = snapshot.data.teams.find(t => t.slug === (home ? result.awayTeamId : result.homeTeamId))!;
    const recorded = events.filter(e => e.matchId === id);
    return [{ id, result, fixture, rival, home, events: recorded, discipline: observedDisciplineSummary(recorded), day: day?.number ?? null, startsAt: scheduled?.startsAt ?? fixture.startsAt, status: scheduled?.status ?? "finished" as const }];
  }).sort((a,b) => (a.startsAt ? Date.parse(a.startsAt) : Infinity) - (b.startsAt ? Date.parse(b.startsAt) : Infinity) || a.id.localeCompare(b.id));
  return { team, stats, values, ownGoals, shares, history, cards: events.filter(e => ["yellow", "second-yellow", "red"].includes(e.kind)), complete: stats?.complete === true, cardsCovered };
}

export function eventLabel(e: MatchEvent) {
  if (e.kind === "goal") return e.phase === "shootout" ? "Lanzamiento de tanda · fuera del goleo" : e.ownGoal ? "Autogol" : "Gol";
  if (e.kind === "yellow") return "Amarilla";
  if (e.kind === "second-yellow") return "Expulsión por doble amarilla";
  if (e.kind === "red") return e.dismissalCause === "direct" ? "Roja directa" : "Expulsión · causa no especificada";
  return "Participación registrada";
}
