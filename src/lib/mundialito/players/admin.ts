import "server-only";
import { cache } from "react";
import { requireAdministrator } from "../admin/server";
import { readPlayer, readPlayers, readRosterContext } from "./repository";
export const getAdminRosterContext = cache(async () =>
  readRosterContext(await requireAdministrator()),
);
export const getAdminTeamRoster = cache(async (slug: string) => {
  const client = await requireAdministrator(),
    context = await getAdminRosterContext(),
    team = context.teams.find((t) => t.slug === slug);
  if (!team) return null;
  return { team, players: await readPlayers(client, context, team.id) };
});
export const getAdminPlayer = cache(async (slug: string, id: string) => {
  const client = await requireAdministrator(),
    context = await getAdminRosterContext(),
    team = context.teams.find((t) => t.slug === slug);
  if (!team) return null;
  const player = await readPlayer(client, context, id, team.id);
  return player ? { team, player } : null;
});
