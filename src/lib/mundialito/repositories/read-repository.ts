import type { GroupId, Team, TournamentData } from "../domain/types.ts";
export interface TournamentRepository {
  getData(): Promise<TournamentData>;
  getTeams(): Promise<readonly Team[]>;
  getTeamsByGroup(group: GroupId): Promise<readonly Team[]>;
  getTeam(slug: string): Promise<Team | undefined>;
}
/** All public getters use the same selected source; no local fallback on read errors. */
export function createReadRepository(
  load: () => Promise<TournamentData>,
): TournamentRepository {
  return {
    getData: load,
    async getTeams() {
      return (await load()).teams;
    },
    async getTeamsByGroup(group) {
      return (await load()).teams.filter((team) => team.group === group);
    },
    async getTeam(slug) {
      return (await load()).teams.find((team) => team.slug === slug);
    },
  };
}
