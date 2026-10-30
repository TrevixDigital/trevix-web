import fs from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type React from "react";
import { tournamentData } from "../../src/lib/mundialito/data/tournament.ts";
import { createCompetitionReport } from "../../src/lib/mundialito/repositories/competition-report.ts";
import type { GroupsReport } from "../../src/app/(torneo)/mundialito/grupos/standings-view.tsx";
import { groupIds } from "../../src/lib/mundialito/data/teams.ts";

export function syntheticGroupsReport(groupsPlayed = 6) {
  const fixtures = groupIds.flatMap(group => {
    const members = tournamentData.teams.filter(t => t.group === group);
    return [[0,1],[0,2],[1,2]].map(([h,a],i)=>({id:`isolated-${group}-${i}`,stage:"groups" as const,group,homeTeamId:members[h].slug,awayTeamId:members[a].slug}));
  });
  return createCompetitionReport({ ...tournamentData, fixtures, players: [], events: [], draws: [], interpretation: undefined, assignmentResolution: undefined,
    results: fixtures.filter(f => "ABCDEF".indexOf(f.group!) < groupsPlayed).map(f => {
      const members = tournamentData.teams.filter(t => t.group === f.group), home = members.findIndex(t => t.slug === f.homeTeamId), away = members.findIndex(t => t.slug === f.awayTeamId), goals = "ABCDEF".indexOf(f.group!) + 1;
      return { matchId:f.id,homeTeamId:f.homeTeamId!,awayTeamId:f.awayTeamId!,state:"confirmed" as const,homeGoals:home<away?goals:0,awayGoals:home<away?0:goals };
    }), disciplineCoverage: fixtures.filter(f => "ABCDEF".indexOf(f.group) < groupsPlayed).map(f => f.id), eventCoverage: [],
  });
}
export function loadGroupViews() {
  const require = createRequire(import.meta.url), exports: Record<string,unknown> = {};
  const code = ts.transpileModule(fs.readFileSync(new URL('../../src/app/(torneo)/mundialito/grupos/standings-view.tsx',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  runInNewContext(code,{exports,require:(id:string)=>id==="next/link"?{__esModule:true,default:"a"}:id==="./groups.module.css"?{__esModule:true,default:new Proxy({},{get:(_t,k)=>String(k)})}:require(id)});
  return exports as {GroupTables:React.ComponentType<{report:GroupsReport}>;ThirdsStandings:React.ComponentType<{report:GroupsReport}>};
}
