import type { TournamentData } from "../domain/types.ts";
import { disciplineSummary } from "./discipline.ts";
import type { RedQualification } from "./regulatory.ts";

/** Articles 23/24/25. Calculation only: never records a debt, payment or served suspension. */
export function disciplinaryObligations(data:TournamentData,qualifications:readonly RedQualification[]=[]) {
  return data.results.filter(r=>r.state==="confirmed").flatMap(result=>data.players.flatMap(player=>{
    if(![result.homeTeamId,result.awayTeamId].includes(player.teamId))return [];
    const events=data.events.filter(e=>e.matchId===result.matchId&&e.playerId===player.id&&["yellow","red","second-yellow"].includes(e.kind));
    if(!events.length)return [];
    const summary=disciplineSummary(events);
    const complete=data.disciplineCoverage.includes(result.matchId)&&!events.some(e=>e.disciplineUncertified);
    const doubleYellow=events.some(e=>e.kind==="second-yellow")||events.filter(e=>e.kind==="yellow").length===2;
    const red=events.find(e=>e.kind==="red");
    const qualification=red?qualifications.find(q=>q.eventId===red.id&&q.documentReference.trim()):undefined;
    const fineComponents:{article:string;quetzales:number;description:string}[]=[];
    if(complete&&summary.yellows)fineComponents.push({article:"23",quetzales:doubleYellow?20:10,description:doubleYellow?"Dos amarillas: Q20 en total":"Una amarilla: Q10"});
    if(complete&&red&&qualification?.kind==="without-aggression")fineComponents.push({article:"24",quetzales:30,description:"Roja directa sin agresión, calificada mediante resolución: Q30"});
    const unresolved=!complete||!!red&&qualification?.kind!=="without-aggression";
    return [{playerId:player.id,teamId:player.teamId,matchId:result.matchId,yellows:summary.yellows,reds:summary.reds,
      points:complete?summary.points:null,certified:complete,fineComponents,
      totalQuetzales:unresolved?null:fineComponents.reduce((sum,c)=>sum+c.quetzales,0),
      suspensionMatches:complete&&(doubleYellow||qualification?.kind==="without-aggression")?1:null,
      requiresCommittee:!!red&&qualification?.kind!=="without-aggression",
      paymentStatus:"not-recorded" as const,
      note:!complete?"Tarjetas pendientes de revisión; no se genera obligación definitiva.":unresolved?"Calificación y sanción de roja pendientes del Comité; no se presume multa ni expulsión definitiva.":"Cálculo reglamentario; pago y cumplimiento de suspensión no acreditados."}];
  }));
}
