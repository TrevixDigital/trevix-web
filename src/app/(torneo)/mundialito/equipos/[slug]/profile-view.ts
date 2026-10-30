import type { CalendarDay } from "@/lib/mundialito/calendar";
import type { createCompetitionReport } from "@/lib/mundialito/repositories/competition-report";
import type { RosterPlayer } from "@/lib/mundialito/players/model";
import { qualification } from "@/lib/mundialito/engine/tournament";
export interface TeamProfileProps { slug:string; report:ReturnType<typeof createCompetitionReport>; calendar:{days:CalendarDay[]}; roster:readonly RosterPlayer[]; }
export function teamProfileView({slug,report,calendar}:TeamProfileProps) {
  const snapshot=report.calculation,team=snapshot.data.teams.find(t=>t.slug===slug);
  if(!team)throw new Error("El equipo no pertenece al catálogo oficial.");
  const group=snapshot.groups.find(g=>g.group===team.group)!,row=group.rows.find(r=>r.team.slug===slug)!;
  const label=qualification(row,group,snapshot),classification=report.publication.status!=="official"&&label==="Clasificado confirmado"?"Clasificación provisional":label;
  const metrics=[{label:"Posición",value:row.position},{label:"Puntos",value:row.stats.played?row.stats.points:null},{label:"PJ",value:row.stats.played||null},{label:"Ganados",value:row.stats.played?row.stats.won:null},{label:"Empatados",value:row.stats.played?row.stats.drawn:null},{label:"Perdidos",value:row.stats.played?row.stats.lost:null},{label:"Goles a favor",value:row.stats.played?row.stats.gf:null},{label:"Goles en contra",value:row.stats.played?row.stats.ga:null},{label:"Diferencia",value:row.stats.played?row.stats.gd:null}];
  const matches=snapshot.data.fixtures.flatMap(f=>{
    const bracket=snapshot.bracket.find(m=>m.id===f.id),home=bracket?.home.teamId??f.homeTeamId,away=bracket?.away.teamId??f.awayTeamId;
    if(![home,away].includes(slug))return [];
    const day=calendar.days.find(d=>d.matches.some(m=>m.id===f.id)),scheduled=day?.matches.find(m=>m.id===f.id),stored=snapshot.data.results.find(r=>r.matchId===f.id),status=scheduled?.status??(stored?.state==="confirmed"?"finished":stored?.state==="live"?"live":"scheduled"),result=status==="scheduled"?undefined:stored;
    const name=(id:string|undefined,source:string)=>snapshot.data.teams.find(t=>t.slug===id)?.name??source;
    return [{fixture:f,home:name(home,bracket?.home.label??"Local por definir"),away:name(away,bracket?.away.label??"Visitante por definir"),status,result,day:day?.number??null,number:scheduled?.number??null,startsAt:scheduled?.startsAt??f.startsAt,projection:!!bracket&&(!f.homeTeamId||!f.awayTeamId)&&report.operations.find(o=>o.matchId===f.id)?.canPublishOfficial!==true}];
  }).sort((a,b)=>(a.startsAt?Date.parse(a.startsAt):Infinity)-(b.startsAt?Date.parse(b.startsAt):Infinity)||(a.number??Infinity)-(b.number??Infinity)||a.fixture.id.localeCompare(b.fixture.id));
  const allScorers=snapshot.statistics.eventComplete?snapshot.statistics.scorers:snapshot.statistics.recordedScorers.map(r=>({...r,position:snapshot.statistics.recordedScorers.findIndex(s=>s.goals===r.goals)+1}));
  const scorers=allScorers.filter(r=>r.player.teamId===slug&&r.goals>0),cards=snapshot.statistics.playerRows.filter(r=>r.player.teamId===slug&&(r.yellows>0||r.reds>0));
  return {team,row,classification,metrics,matches,scorers,cards,totals:snapshot.statistics.teamRows.find(r=>r.team.slug===slug)?.stats};
}
