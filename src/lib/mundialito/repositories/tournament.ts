import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { selectCalendar } from "@/lib/mundialito/calendar";
import { tournamentData } from "@/lib/mundialito/data/tournament";
import { createCompetitionReport } from "@/lib/mundialito/repositories/competition-report";
import { createReadRepository } from "@/lib/mundialito/repositories/read-repository";
import { readConfiguration } from "@/lib/mundialito/supabase/read-config";
import { createServerReadClient } from "@/lib/mundialito/supabase/server-read";
import { createTournamentReader } from "@/lib/mundialito/supabase/reader";
import { readSupabaseCalendar } from "@/lib/mundialito/adapters/supabase-calendar";
import type { CalendarMetadata } from "@/lib/mundialito/supabase/read-types";
import { enrichWithEvents } from "@/lib/mundialito/events/read";
export type { TournamentRepository } from "@/lib/mundialito/repositories/read-repository";

const loadSnapshot = cache(async () => {
  const configuration = readConfiguration({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (configuration.mode === "local")
    return { data: tournamentData, metadata: null as CalendarMetadata | null };
  // Bail out of prerendering before the SDK can catch Next's rendering signal.
  // Official remote data is read afresh for each incoming request.
  await connection();
  // Intentionally no catch/fallback to local fixtures, results, players or events.
  const client = createServerReadClient(configuration);
  return enrichWithEvents(
    client,
    await readSupabaseCalendar(createTournamentReader(client),{deferKnockoutVerification:true}),
  );
});
export const tournamentRepository = createReadRepository(
  async () => (await loadSnapshot()).data,
);
/** Server diagnostics preserve UUIDs, match numbers, matchdays and original sources. */
export const getCalendarReadMetadata = cache(
  async () => (await loadSnapshot()).metadata,
);
/** No official publication is inferred from a finished score or a certified acta. */
export const getCompetitionReport = cache(async () =>
  createCompetitionReport(await tournamentRepository.getData()),
);
export const getTournament = cache(async () => (await getCompetitionReport()).calculation);
export const getClassificationPublication = cache(async () => (await getCompetitionReport()).publication);
export const getCalendar = cache(async () => {
  const snapshot = await loadSnapshot();
  return selectCalendar(snapshot.data, snapshot.metadata, new Date());
});
