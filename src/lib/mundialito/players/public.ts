import "server-only";
import { cache } from "react";
import {
  getCalendarReadMetadata,
  tournamentRepository,
} from "../repositories/tournament";
import { readConfiguration } from "../supabase/read-config";
import { createServerReadClient } from "../supabase/server-read";
import { readPublicPlayerRecord, readPlayers } from "./repository";
import {
  playerIdFromSlug,
  publicPlayerSlug,
  type RosterPlayer,
  type RosterContext,
} from "./model";

const source = cache(async () => {
  const metadata = await getCalendarReadMetadata();
  if (!metadata) return null;
  const configuration = readConfiguration({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (configuration.mode !== "supabase")
    throw new Error("No se puede cambiar el origen de la nómina.");
  const context: RosterContext = {
    tournamentId: metadata.tournament.id,
    teams: metadata.teams.map((t) => ({
      id: t.id,
      slug: t.localSlug,
      name: t.name,
      group: metadata.groups.find((g) => g.id === t.groupId)!.localGroup,
    })),
  };
  return { client: createServerReadClient(configuration), context };
});
const localPlayers = cache(async (): Promise<RosterPlayer[]> =>
  (await tournamentRepository.getData()).players.map((p) => ({
    id: p.id,
    tournamentId: "local",
    teamId: p.teamId,
    fullName: p.name,
    slug: p.slug,
    shirtNumber: p.shirtNumber,
    position: null,
    active: true,
    updatedAt: "",
  })),
);
export const getPublicTeamRoster = cache(async (teamSlug: string) => {
  const s = await source();
  if (!s)
    return (await localPlayers()).filter(
      (p) => p.teamId === teamSlug && p.active,
    );
  const team = s.context.teams.find((t) => t.slug === teamSlug);
  if (!team) return [];
  return (await readPlayers(s.client, s.context, team.id)).filter(
    (p) => p.active,
  );
});
export const getPublicPlayer = cache(async (slug: string) => {
  const s = await source();
  if (!s) {
    const player = (await localPlayers()).find(
      (p) => p.slug === slug || p.id === playerIdFromSlug(slug),
    );
    return player
      ? { player, teamSlug: player.teamId, canonical: player.slug }
      : null;
  }
  const player = await readPublicPlayerRecord(s.client, s.context, slug);
  if (!player) return null;
  const team = s.context.teams.find((t) => t.id === player!.teamId)!;
  return { player, teamSlug: team.slug, canonical: publicPlayerSlug(player) };
});
