import type { createAdminClient } from "./client.ts";
import { TOURNAMENT_SLUG } from "../supabase/calendar-mapping.ts";
export async function readAdminDashboard(
  client: ReturnType<typeof createAdminClient>,
) {
  const tournament = await client
    .from("tournaments")
    .select("id,name,slug")
    .eq("slug", TOURNAMENT_SLUG)
    .maybeSingle();
  if (
    tournament.error ||
    !tournament.data ||
    typeof tournament.data.id !== "string" ||
    tournament.data.slug !== TOURNAMENT_SLUG
  )
    throw new Error("TOURNAMENT_NOT_AVAILABLE");
  const id = tournament.data.id;
  const count = async (
    table: "teams" | "groups" | "matches",
    status?: "scheduled" | "finished",
  ) => {
    let query = client
      .from(table)
      .select("id", { head: true, count: "exact" })
      .eq("tournament_id", id);
    if (status) query = query.eq("status", status);
    const result = await query;
    if (
      result.error ||
      !Number.isSafeInteger(result.count) ||
      result.count === null ||
      result.count < 0
    )
      throw new Error("ADMIN_COUNT_UNAVAILABLE");
    return result.count;
  };
  const [teams, groups, matches, scheduled, finished] = await Promise.all([
    count("teams"),
    count("groups"),
    count("matches"),
    count("matches", "scheduled"),
    count("matches", "finished"),
  ]);
  if (teams !== 18 || groups !== 6)
    throw new Error("INCOMPLETE_OFFICIAL_ROSTER");
  if (matches !== 34 || scheduled + finished > matches)
    throw new Error("INCOMPLETE_OFFICIAL_CALENDAR");
  return { teams, groups, scheduled, finished };
}
