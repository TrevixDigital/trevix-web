import type { TournamentData } from "./domain/types.ts";
import type {
  CalendarMetadata,
  CalendarStatus,
} from "./supabase/read-types.ts";

export interface CalendarMatch {
  id: string;
  number: number | null;
  status: CalendarStatus;
  startsAt: string | null;
}
export interface CalendarDay {
  id: string;
  number: number | null;
  date: string | null;
  matches: CalendarMatch[];
}
export function guatemalaDate(instant: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guatemala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}
/** Calendar projection only. Never infers a result from a clock or imports a score. */
export function selectCalendar(
  data: TournamentData,
  metadata: CalendarMetadata | null,
  now: Date,
) {
  const days: CalendarDay[] = metadata
    ? metadata.matchdays
        .map((d) => ({
          id: d.id,
          number: d.number,
          date: d.scheduledDate,
          matches: [],
        }))
        .sort((a, b) => a.number! - b.number!)
    : [];
  const byId = new Map(days.map((d) => [d.id, d]));
  const unassigned: CalendarDay = {
    id: "unassigned",
    number: null,
    date: null,
    matches: [],
  };
  for (const fixture of data.fixtures) {
    const remote = metadata?.matches.find((m) => m.localId === fixture.id);
    if (metadata && !remote)
      throw new Error(
        "El calendario remoto no contiene los metadatos de un partido; no se asumirá su estado.",
      );
    const result = data.results.find((r) => r.matchId === fixture.id);
    const status =
      remote?.status ??
      (result?.state === "confirmed"
        ? "finished"
        : result?.state === "live"
          ? "live"
          : "scheduled");
    // Only the explicit matchday UUID establishes membership; dates never create a jornada.
    const day = remote?.matchdayId ? byId.get(remote.matchdayId) : undefined;
    (day ?? unassigned).matches.push({
      id: fixture.id,
      number: remote?.matchNumber ?? null,
      status,
      startsAt: fixture.startsAt ?? null,
    });
  }
  if (unassigned.matches.length) days.push(unassigned);
  for (const day of days)
    day.matches.sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
  const today = guatemalaDate(now);
  const candidateDate = (day: CalendarDay) =>
    day.matches
      .filter((m) => m.status === "scheduled")
      .map((m) => (m.startsAt ? guatemalaDate(m.startsAt) : day.date))
      .filter((date): date is string => date !== null && date >= today)
      .sort()[0];
  const next =
    days
      .filter((d) => candidateDate(d))
      .sort(
        (a, b) =>
          candidateDate(a)!.localeCompare(candidateDate(b)!) ||
          (a.number ?? Infinity) - (b.number ?? Infinity),
      )[0] ?? null;
  const played = days.filter((d) =>
    d.matches.some((m) => m.status === "finished"),
  );
  const last =
    played.sort((a, b) => {
      const date = (d: CalendarDay) =>
        d.date ??
        d.matches
          .filter((m) => m.status === "finished" && m.startsAt)
          .map((m) => guatemalaDate(m.startsAt!))
          .sort()
          .at(-1) ??
        "";
      return (
        date(b).localeCompare(date(a)) || (b.number ?? -1) - (a.number ?? -1)
      );
    })[0] ?? null;
  return { days, next, last };
}
