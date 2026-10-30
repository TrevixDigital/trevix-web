import type { TournamentSnapshot } from "@/lib/mundialito/engine/tournament";
import { observedDisciplineSummary } from "@/lib/mundialito/engine/discipline";
/** Public presentation aggregations only; sporting calculations remain in the engine. */
export function statisticsView(snapshot:TournamentSnapshot) {
  const stats=snapshot.statistics,data=snapshot.data;
  const scorers=stats.eventComplete?stats.scorers:stats.recordedScorers.map(r=>({...r,position:stats.recordedScorers.findIndex(s=>s.goals===r.goals)+1}));
  const finished=data.results.filter(r=>r.state==="confirmed"),ids=new Set(finished.map(r=>r.matchId));
  const cards=data.events.filter(e=>ids.has(e.matchId)&&["yellow","red","second-yellow"].includes(e.kind));
  const yellowRows=stats.playerRows.filter(r=>r.yellows>0).sort((a,b)=>b.yellows-a.yellows);
  const redRows=stats.playerRows.filter(r=>r.reds>0).sort((a,b)=>b.reds-a.reds).map(r=>{
    const events=cards.filter(e=>e.playerId===r.player.id),direct=events.filter(e=>e.kind==="red"&&e.dismissalCause==="direct").length,second=events.filter(e=>e.kind==="second-yellow").length;
    return {...r,direct,second,unspecified:Math.max(0,r.reds-direct-second)};
  });
  const disciplineRows=(stats.disciplineComplete?stats.discipline:stats.teamRows).map(row=>{
    const matches=finished.filter(r=>r.homeTeamId===row.team.slug||r.awayTeamId===row.team.slug);
    const reviewed=matches.every(r=>data.disciplineCoverage.includes(r.matchId)||data.provisionalDisciplineCoverage?.some(c=>c.matchId===r.matchId&&c.teamId===row.team.slug));
    const observed=observedDisciplineSummary(cards.filter(e=>e.teamId===row.team.slug));
    return {...row,position:stats.disciplineComplete?stats.discipline.find(r=>r.team.slug===row.team.slug)?.position:undefined,reviewed,observed,points:stats.disciplineComplete?row.stats.discipline:reviewed?observed.points:null};
  });
  const scoreGoals=finished.reduce((n,r)=>n+r.homeGoals+r.awayGoals,0),topGoals=stats.attack[0]?.stats.gf;
  return {scorers,yellowRows,redRows,disciplineRows,finished:finished.length,scoreGoals:finished.length?scoreGoals:null,average:finished.length?scoreGoals/finished.length:null,playersWithGoals:stats.recordedScorers.length,attributedGoals:stats.recordedScorers.reduce((n,r)=>n+r.goals,0),attackLeaders:stats.attack.filter(r=>r.stats.gf===topGoals)};
}
