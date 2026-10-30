import { bracketDefinitions } from "./bracket.ts";
import type { TournamentSnapshot } from "./tournament.ts";
import type { CompetitionEvidence, ClassificationPublication } from "../domain/governance.ts";

/** Operational gate separate from the mathematical projection. No fixture/result is changed. */
export function operationalBracket(calculation:TournamentSnapshot,publication:ClassificationPublication,evidence?:CompetitionEvidence) {
  const blocked=new Set<string>();
  const protestBlocked=new Set<string>();
  const unresolved=(evidence?.protests??[]).filter(p=>p.status!=="resolved"||!p.resolution?.id.trim()||
    !p.resolution.documentReference.trim()||!Number.isFinite(Date.parse(p.resolution.notifiedAt)));
  const groups=new Set(calculation.data.fixtures.filter(f=>f.stage==="groups").map(f=>f.id));
  const groupProtest=unresolved.some(p=>p.affectsGroupClassification||p.matchIds.some(id=>groups.has(id)));
  return calculation.bracket.map(match=>{
    const d=bracketDefinitions.find(d=>d.id===match.id)!;
    const parents=[d.home,d.away].filter(s=>s.startsWith("W:")||s.startsWith("L:")).map(s=>s.slice(2));
    const reasons:string[]=[];
    const sporting=!!calculation.data.sportingConfirmation&&publication.status==="official";
    if(!sporting&&!evidence?.protestsComplete) reasons.push("protests_unverified");
    if(groupProtest||unresolved.some(p=>p.matchIds.includes(match.id))||parents.some(id=>protestBlocked.has(id))) {
      reasons.push("protest_pending");protestBlocked.add(match.id);
    }
    if(match.stage==="round16"&&publication.status!=="official") reasons.push("classification_unapproved");
    for(const parent of parents) {
      if(sporting) {
        const previous=calculation.bracket.find(m=>m.id===parent);
        if(previous?.result?.state!=="confirmed"||!previous.winnerId)reasons.push("previous_result_pending");
        continue;
      }
      const r=evidence?.reviews.find(r=>r.matchId===parent);
      // Stale evidence has already been removed from calculation coverage by the central report.
      if(!r?.goals.complete||!r.cards.complete||!calculation.data.eventCoverage.includes(parent)||!calculation.data.disciplineCoverage.includes(parent))
        reasons.push("previous_acta_pending");
    }
    if(parents.some(id=>blocked.has(id))&&!reasons.includes("protest_pending"))reasons.push("previous_round_blocked");
    if(match.state!=="confirmed"||!match.home.teamId||!match.away.teamId)reasons.push("participants_pending");
    if(reasons.length) blocked.add(match.id);
    return {matchId:match.id,state:reasons.length?"blocked" as const:"ready" as const,
      reasons:[...new Set(reasons)],projection:match,canPublishOfficial:reasons.length===0};
  });
}
