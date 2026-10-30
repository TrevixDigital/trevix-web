import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdministrator } from "@/lib/mundialito/admin/server";
import { readAdminMatches } from "@/lib/mundialito/matches/repository";
import { MatchForm } from "../../match-form";
import styles from "../../../admin.module.css";
import { randomUUID } from "node:crypto";
import { EventPanel } from "../../event-panel";
import { CardPanel } from "../../card-panel";
import { ReviewPanel } from "../../review-panel";
import { readMatchReview, loadCertificationSnapshot, type CertificationSnapshot } from "@/lib/mundialito/events/reviews";
import { phase4Capabilities } from "@/lib/mundialito/events/capabilities";
import { statusLabels } from "@/lib/mundialito/matches/model";
import { matchIntegrity, storedScoreLabel } from "@/lib/mundialito/matches/integrity";
import { readMatchHistory, type AuditEntry } from "@/lib/mundialito/admin/regulatory-read";
import { HistoryPanel } from "../../history-panel";
import { summarizeActa } from "@/lib/mundialito/events/acta-summary";
import { ActaSummaryPanel } from "../../acta-summary-panel";
import { SimpleMatchForm } from "../../simple-match-form";
import { saveSimpleActaAction } from "../../simple-actions";
import { playerTotals, type SimpleBinding } from "@/lib/mundialito/events/simple-acta";
import { loadPlayerCards } from "@/lib/mundialito/events/card-repository";
import { cardDefaults, type CardState } from "@/lib/mundialito/events/cards";
import { createHash } from "node:crypto";
export default async function EditMatch({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    client = await requireAdministrator(),
    data = await readAdminMatches(client, true),
    row = data.records.find((r) => r.id === id);
  if (!row) notFound();
  const issues=matchIntegrity(row);
  let history:AuditEntry[]=[],historyError="";
  try{history=await readMatchHistory(client,data.metadata.tournament.id,id);}
  catch{historyError="No se pudo verificar el historial con tu sesión. Esto no significa que no existan cambios; revisa permisos y conexión.";}
  const capabilities = phase4Capabilities();
  let reviewState: Awaited<ReturnType<typeof readMatchReview>> = { available: false, review: null, readEnabled: capabilities.read };
  let reviewError = "";
  try { reviewState = await readMatchReview(client, { matchId: id, tournamentId: data.metadata.tournament.id }); }
  catch { reviewError = "No se pudo verificar el acta con tu sesión. No se asumirá que está certificada; revisa conexión y permisos."; }
  let certificationSnapshot: CertificationSnapshot | undefined;
  if (capabilities.isolated && capabilities.certificationWrite) {
    try {
      certificationSnapshot = await loadCertificationSnapshot(client, { matchId: id, tournamentId: data.metadata.tournament.id });
      reviewState = { available: true, readEnabled: true, review: certificationSnapshot.review };
    } catch { reviewError = "La protección concurrente v2 no está disponible. La certificación permanece bloqueada; no se utilizará la RPC anterior."; }
  }
  const m = data.metadata.matches.find((m) => m.id === id)!,
    b = data.snapshot.bracket.find((b) => b.id === m.localId),
    names = new Map(data.metadata.teams.map((t) => [t.id, t.name]));
  const teams = [m.homeTeamId,m.awayTeamId].flatMap(teamId => teamId ? [{id:teamId,name:names.get(teamId)!}] : []);
  const players = (data.players??[]).filter(p=>teams.some(t=>t.id===p.teamId));
  const events = (data.events??[]).filter(e=>e.match_id===id);
  const cards: Record<string,CardState> = {};
  let simpleError = "";
  for(const p of players) cards[p.id]={basis:createHash("sha256").update("[]").digest("hex"),events:[]};
  if(capabilities.read) {
    // Empty sets have the exact revision-4 hash of []. Only players with cards
    // need private RPC reads, preserving full minutes/notes and concurrency basis.
    try {
      for(const p of players.filter(p=>events.some(e=>e.player_id===p.id&&["yellow_card","red_card"].includes(e.event_type))))
        cards[p.id]=await loadPlayerCards(client,{matchId:id,teamId:p.teamId,playerId:p.id});
    } catch { simpleError="No se pudieron cargar todas las tarjetas. Recarga antes de guardar; no se asumirán cantidades cero."; }
  } else if(events.some(e=>["yellow_card","red_card"].includes(e.event_type))) {
    simpleError="La lectura de tarjetas debe estar disponible para editar el acta completa sin perder información.";
  }
  const binding:SimpleBinding={id,operationId:randomUUID(),version:row.updated_at as string,phase:row.phase as string,
    values:{scheduled_at:m.scheduledAt,venue:m.venue,notes:row.notes as string|null,status:m.status,home_score:row.home_score as number|null,away_score:row.away_score as number|null,home_penalties:row.home_penalties as number|null,away_penalties:row.away_penalties as number|null},
    teams,players,goals:events.filter(e=>e.event_type==="goal"||e.event_type==="own_goal"),cards};
  return (
    <section className={styles.dashboard}>
      <Link href="/mundialito/admin/partidos" className={styles.backLink}>
        ← Partidos
      </Link>
      <h1>Acta del partido {m.matchNumber}</h1>
      <p className={styles.hint}>Sede oficial del torneo: La Bomba, La Libertad, Petén, Guatemala.</p>
      <p className={styles.notice}>
        {(m.homeTeamId && names.get(m.homeTeamId)) ||
          b?.home.label ||
          "Por definir"}{" "}
        VS{" "}
        {(m.awayTeamId && names.get(m.awayTeamId)) ||
          b?.away.label ||
          "Por definir"}
        . Equipos, fase, jornada, grupo y referencias de llave son de solo
        lectura.
      </p>
      {simpleError?<p role="alert" className={styles.error}>{simpleError}</p>:<SimpleMatchForm save={saveSimpleActaAction.bind(null,binding)} values={binding.values} phase={binding.phase} teams={teams} players={players}
        initialTotals={playerTotals(binding)} writable={capabilities.cardsWrite}
        exceptionalCards={players.filter(p=>cardDefaults(cards[p.id]).reviewRequired||cards[p.id].events.some(e=>e.event_type==="red_card"&&!e.dismissal_cause)).map(p=>p.id)}/>}
      <details className={styles.actaSection}>
      <summary>Opciones adicionales, minutos e historial</summary>
      <p className={styles.hint}>Los controles siguientes conservan las opciones anteriores. Guarda o recarga el formulario principal antes de usar una edición individual.</p>
      <nav className={styles.actaLinks} aria-label="Secciones del acta">
        <a href="#marcador-acta">Marcador</a><a href="#goles-acta">Goles</a><a href="#tarjetas-acta">Tarjetas</a><a href="#revision-acta">Revisión</a><a href="#historial-acta">Historial</a>
      </nav>
      <div className={styles.reviewGrid}>
        <article className={styles.reviewStatus}><h2>Estado del encuentro</h2><strong>{statusLabels[m.status]}</strong><p>{m.status === "scheduled" || row.home_score === null || row.away_score === null ? "VS · encuentro programado o sin marcador completo" : `${row.home_score} – ${row.away_score}`}</p>{row.home_penalties !== null && row.away_penalties !== null && <p>Penales: {String(row.home_penalties)} – {String(row.away_penalties)}</p>}</article>
        <article className={styles.reviewStatus}><h2>Control del acta</h2><p>Marcador y eventos se guardan por separado. La certificación no modifica el resultado ni asigna goles.</p></article>
      </div>
      <ActaSummaryPanel summary={summarizeActa(row,(data.events??[]).filter(e=>e.match_id===id))}
        readable={capabilities.read} cardsWritable={capabilities.cardsWrite} certificationWritable={capabilities.certificationWrite}/>
      {issues.length>0&&<aside className={styles.notice} aria-label="Incidencias del dato guardado"><h2>Revisión de integridad</h2>
        <p>Marcador almacenado en Supabase: {storedScoreLabel(row)}. Estado: {statusLabels[m.status]}.</p>
        {issues.map((issue,i)=><p key={`${issue.code}:${i}`}>{issue.message}</p>)}
        <p>No se ha corregido ningún registro automáticamente.</p>
      </aside>}
      <details id="marcador-acta" className={styles.actaSection} open>
      <summary>1. Marcador, estado y programación</summary>
      <MatchForm
        key={`${id}:${row.updated_at}`}
        id={id}
        version={row.updated_at as string}
        phase={m.phase}
        values={{
          scheduled_at: m.scheduledAt,
          venue: m.venue,
          notes: row.notes as string | null,
          status: m.status,
          home_score: row.home_score as number | null,
          away_score: row.away_score as number | null,
          home_penalties: row.home_penalties as number | null,
          away_penalties: row.away_penalties as number | null,
        }}
      />
      </details>
      <details id="goles-acta" className={styles.actaSection} open>
      <summary>2. Goles y autogoles</summary>
      <EventPanel
        matchId={id}
        newId={randomUUID()}
        events={(data.events ?? []).filter((e) => e.match_id === id && (e.event_type==="goal"||e.event_type==="own_goal"))}
        players={data.players ?? []}
        teams={data.metadata.teams.filter((t) => [m.homeTeamId, m.awayTeamId].includes(t.id)).map((t) => ({ id: t.id, name: t.name }))}
        warnings={(data.scoreWarnings ?? []).filter((w) => w.matchId === id).map((w) => w.message)}
      />
      </details>
      <details id="tarjetas-acta" className={styles.actaSection} open>
      <summary>3. Tarjetas por jugador</summary>
      <CardPanel
        matchId={id}
        readable={capabilities.read}
        writable={capabilities.cardsWrite}
        recordedEvents={(data.events??[]).filter(e=>e.match_id===id&&(e.event_type==="yellow_card"||e.event_type==="red_card"))}
        players={data.players ?? []}
        teams={data.metadata.teams
          .filter((t) => [m.homeTeamId, m.awayTeamId].includes(t.id))
          .map((t) => ({ id: t.id, name: t.name }))}
      />
      </details>
      <ReviewPanel key={certificationSnapshot?.basis ?? reviewState.review?.updated_at ?? `unreviewed:${row.updated_at}`}
        matchId={id} tournamentId={data.metadata.tournament.id}
        {...reviewState} writable={capabilities.certificationWrite}
        finished={m.status === "finished" && row.home_score !== null && row.away_score !== null && !!m.homeTeamId && !!m.awayTeamId}
        error={reviewError}
        snapshot={certificationSnapshot}
        names={Object.fromEntries((data.players ?? []).map(p => [p.id, p.fullName]))}
        teamNames={Object.fromEntries(data.metadata.teams.map(t => [t.id,t.name]))}
      />
      <aside className={styles.notice} aria-label="Asuntos pendientes del Comité">
        <h2>Asuntos pendientes del Comité</h2>
        {b && b.state !== "confirmed" ? <p>La llave no tiene participantes confirmados. No se inventarán clasificados.</p> : <p>Las discrepancias que requieran una resolución oficial deben documentarse en el control reglamentario. Esta pantalla no resuelve sorteos ni sanciones.</p>}
        <Link href="/mundialito/admin/reglamento">Consultar control reglamentario</Link>
      </aside>
      <HistoryPanel entries={history} error={historyError} teams={data.metadata.teams} players={data.players??[]}/>
      </details>
    </section>
  );
}
