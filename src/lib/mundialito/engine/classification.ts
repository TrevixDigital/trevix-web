import type { TournamentData } from "../domain/types.ts";
import { calculateTournament } from "./tournament.ts";

/** Sporting closure only. This never certifies an acta or writes participants. */
export function classificationCircuit(data: TournamentData) {
  const calculation=calculateTournament(data);
  const fixtures=data.fixtures.filter(f=>f.stage==="groups");
  const finished=data.results.filter(r=>r.state==="confirmed"&&fixtures.some(f=>f.id===r.matchId));
  const pending:string[]=[];
  if(fixtures.length!==18||finished.length!==18||!calculation.complete)pending.push("results");
  if(calculation.groups.some(g=>g.rows.some(r=>r.position===null||r.pending.length)))pending.push("groups");
  if(calculation.thirds.length!==6||calculation.thirds.some(r=>r.position===null||r.pending.length))pending.push("thirds");
  if(calculation.assignment.state!=="confirmed"||calculation.assignment.pending.length)pending.push("assignment");
  const qualifiers=[...calculation.groups.flatMap(g=>g.rows.filter(r=>r.position===1||r.position===2)),...calculation.thirds.filter(r=>r.position!==null&&r.position<=4)];
  const octavos=calculation.bracket.filter(m=>m.stage==="round16");
  if(qualifiers.length!==16||new Set(qualifiers.map(r=>r.team.slug)).size!==16||octavos.length!==8||octavos.some(m=>m.state!=="confirmed"||!m.home.teamId||!m.away.teamId))pending.push("participants");
  return {ready:pending.length===0,pending,qualifiers,octavos,calculation};
}
