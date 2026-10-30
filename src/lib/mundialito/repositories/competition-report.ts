import { createHash } from "node:crypto";
import type { TournamentData } from "../domain/types.ts";
import type { CompetitionEvidence, ClassificationPublication, PublicationBlocker } from "../domain/governance.ts";
import { calculateTournament } from "../engine/tournament.ts";
import { operationalBracket } from "../engine/operational-bracket.ts";
import { classificationCircuit } from "../engine/classification.ts";
import { classificationConfirmationBasis } from "../events/classification-decisions.ts";

const compare = (a: string, b: string) => a === b ? 0 : a < b ? -1 : 1;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([,v])=>v !== undefined)
    .sort(([a],[b])=>compare(a,b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
function digest(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex"); }
const byId = <T>(rows: readonly T[], key: (row:T)=>string) => [...rows].sort((a,b)=>compare(key(a),key(b)));
const documented = (reference: string | null, time: string | null) =>
  typeof reference === "string" && !!reference.trim() && typeof time === "string" && Number.isFinite(Date.parse(time));

/** Local sporting fingerprint; not interchangeable with PostgreSQL v2 private SHA256. */
export function matchInputBasis(data: TournamentData, matchId: string) {
  const fixture = data.fixtures.find(f=>f.id === matchId);
  if (!fixture) throw new Error("Evidence references an unknown match");
  return digest({ fixture, result: data.results.find(r=>r.matchId === matchId) ?? null,
    events: byId(data.events.filter(e=>e.matchId === matchId),e=>e.id) });
}

/** One calculation source. Evidence never changes the stored result or invents events. */
export function createCompetitionReport(input: TournamentData, evidence?: CompetitionEvidence) {
  const fixtureIds = new Set(input.fixtures.map(f=>f.id));
  const issues: { matchId: string; reason: string }[] = [];
  let data = input;
  if (evidence) {
    if (typeof evidence.protestsComplete !== "boolean") throw new Error("Protest register completeness is unknown");
    if (new Set(evidence.reviews.map(r=>r.matchId)).size !== evidence.reviews.length) throw new Error("Duplicate review evidence");
    if (new Set(evidence.protests.map(p=>p.id)).size !== evidence.protests.length) throw new Error("Duplicate protest evidence");
    const goals: string[] = [], cards: string[] = [];
    for (const review of evidence.reviews) {
      if (!fixtureIds.has(review.matchId)) throw new Error("Review outside the tournament");
      if (typeof review.basis !== "string" || !/^[a-f0-9]{64}$/.test(review.basis) ||
        typeof review.goals?.complete !== "boolean" || typeof review.cards?.complete !== "boolean") throw new Error("Invalid review evidence");
      const result = input.results.find(r=>r.matchId === review.matchId);
      if (review.basis !== matchInputBasis(input,review.matchId) || result?.state !== "confirmed") {
        issues.push({matchId:review.matchId,reason:"stale_or_unfinished_review"});continue;
      }
      if (review.goals.complete && documented(review.goals.documentReference,review.goals.confirmedAt)) goals.push(review.matchId);
      if (review.cards.complete && documented(review.cards.documentReference,review.cards.confirmedAt) &&
        !input.events.some(e=>e.matchId === review.matchId && e.disciplineUncertified)) cards.push(review.matchId);
    }
    for (const protest of evidence.protests) {
      if (!protest.id.trim() || typeof protest.affectsGroupClassification !== "boolean" ||
        !["open","resolved"].includes(protest.status) || !protest.matchIds.length ||
        new Set(protest.matchIds).size !== protest.matchIds.length || protest.matchIds.some(id=>!fixtureIds.has(id)))
        throw new Error("Protest outside the tournament or invalid scope");
    }
    data = { ...input, eventCoverage: goals, disciplineCoverage: cards,
      events: input.events.map(e=>["yellow","red","second-yellow"].includes(e.kind) && !cards.includes(e.matchId)
        ? {...e,disciplineUncertified:true} : e) };
  }
  const calculation = calculateTournament(data);
  const groupFixtures = data.fixtures.filter(f=>f.stage === "groups");
  const groupIds = new Set(groupFixtures.map(f=>f.id));
  const reviews = evidence?.reviews ?? [];
  const protests = evidence?.protests ?? [];
  const basis = digest({
    teams:byId(data.teams,t=>t.slug), fixtures:byId(groupFixtures,f=>f.id), results:byId(data.results.filter(r=>groupIds.has(r.matchId)),r=>r.matchId),
    events:byId(data.events.filter(e=>groupIds.has(e.matchId)),e=>e.id),
    eventCoverage:data.eventCoverage.filter(id=>groupIds.has(id)).sort(), disciplineCoverage:data.disciplineCoverage.filter(id=>groupIds.has(id)).sort(),
    draws:byId(data.draws,d=>d.context), interpretation:data.interpretation, assignment:data.assignmentResolution,
    protestsComplete:evidence?.protestsComplete ?? false,
    // Public publication tokens exclude private acta references and administrator IDs.
    reviews:byId(reviews.filter(r=>groupIds.has(r.matchId)),r=>r.matchId).map(r=>({matchId:r.matchId,basis:r.basis,
      goals:{complete:r.goals.complete,confirmedAt:r.goals.confirmedAt},cards:{complete:r.cards.complete,confirmedAt:r.cards.confirmedAt}})),
    protests:byId(protests.filter(p=>p.affectsGroupClassification),p=>p.id).map(p=>({id:p.id,matchIds:[...p.matchIds].sort(),status:p.status,
      affectsGroupClassification:p.affectsGroupClassification,resolution:p.resolution?{id:p.resolution.id,notifiedAt:p.resolution.notifiedAt}:undefined})),
  });
  const blockers: PublicationBlocker[] = [];
  const complete = calculation.complete && calculation.assignment.state === "confirmed" &&
    calculation.groups.every(g=>g.rows.every(r=>r.position !== null && !r.pending.length));
  if (!calculation.complete) blockers.push("results_pending");
  if (!complete) blockers.push("ranking_pending");
  // Legacy coverage can inform calculations, but is not itself a formal acta proof.
  if (!groupFixtures.length || !groupFixtures.every(f=>{
    const review=reviews.find(r=>r.matchId === f.id);
    return review && review.goals.complete && review.cards.complete && data.eventCoverage.includes(f.id) && data.disciplineCoverage.includes(f.id);
  })) blockers.push("certification_pending");
  if (protests.some(p=>p.affectsGroupClassification && (p.status !== "resolved" || !p.resolution?.id.trim() ||
    !documented(p.resolution.documentReference,p.resolution.notifiedAt)))) blockers.push("protest_pending");
  if (!evidence?.protestsComplete) blockers.push("protests_unverified");
  const approval = evidence?.approval;
  if (!approval || approval.scope !== "group-classification" || !approval.id.trim() ||
    !documented(approval.documentReference,approval.notifiedAt)) blockers.push("approval_missing");
  else if (approval.basis !== basis) blockers.push("approval_stale");
  // Current tournament policy: sporting closure + administrator's recorded
  // assignment confirmation; individual certifications are not a prerequisite.
  // The trusted reader only exposes this marker for a current complete basis
  // and all eight persisted pairings. Legacy formal evidence stays independent.
  const sportsCircuit=classificationCircuit(data);
  const sporting = !!data.sportingConfirmation && sportsCircuit.ready && data.sportingConfirmation.basis===classificationConfirmationBasis(data);
  const currentPolicy=data.classificationPolicy==="sporting";
  const effectiveBlockers:PublicationBlocker[]=currentPolicy?
    [...(!calculation.complete?["results_pending" as const]:[]),...(!sportsCircuit.ready?["ranking_pending" as const]:[]),...(!sporting?["approval_missing" as const]:[])]:blockers;
  const publication: ClassificationPublication = {
    scope:"group-classification", status:sporting?"official":effectiveBlockers.length ? (calculation.groups.some(g=>g.hasResults) ? "provisional" : "pending") : "official",
    basis, blockers:sporting?[]:effectiveBlockers, approvalId:sporting?data.sportingConfirmation!.id:blockers.length ? null : approval!.id, calculationComplete:complete,
  };
  return { calculation, publication, evidenceIssues:issues, operations:operationalBracket(calculation,publication,evidence) };
}
