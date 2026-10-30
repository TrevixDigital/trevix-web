import Link from "next/link";
import { getImageProps } from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { ArrowLeft, UserRound, CalendarDays, Goal, RectangleVertical, Shield, ChartNoAxesColumnIncreasing, History, ArrowUpRight, CircleDot } from "lucide-react";
import { assetPath } from "@/lib/mundialito/site";
import { isUuid, positions } from "@/lib/mundialito/players/model";
import { statusLabels } from "@/lib/mundialito/matches/model";
import { playerView, eventLabel, type PlayerProfileProps } from "./player-view";
import styles from "./player.module.css";

function Panel({ title, icon: Icon, children, className = "" }: { title: string; icon: typeof UserRound; children: ReactNode; className?: string }) {
  return <section className={`${styles.panel} ${className}`}><h2 className={styles.panelTitle}><Icon size={22} aria-hidden="true" />{title}</h2>{children}</section>;
}
function Empty({ children }: { children: ReactNode }) { return <p className={styles.empty}><CircleDot size={22} aria-hidden="true" />{children}</p>; }
const date = (value: string) => new Intl.DateTimeFormat("es-GT", { timeZone: "America/Guatemala", day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
export function PlayerProfile(props: PlayerProfileProps) {
  const v = playerView(props), p = props.player;
  const { props: desktop } = getImageProps({ src: assetPath("/images/player-profile/peten-player-original.webp"), width: 2400, height: 900, sizes: "100vw", alt: "", loading: "eager", fetchPriority: "high" });
  const { props: mobile } = getImageProps({ src: assetPath("/images/player-profile/peten-player-mobile.webp"), width: 1000, height: 1100, sizes: "100vw", alt: "", loading: "eager", fetchPriority: "high" });
  const metrics = [{ label: "Partidos", value: v.values.played, icon: CalendarDays }, { label: "Goles", value: v.values.goals, icon: Goal }, { label: "Amarillas", value: v.values.yellows, icon: RectangleVertical }, { label: "Expulsiones", value: v.values.reds, icon: RectangleVertical }, { label: "Puntos disciplinarios", value: v.values.points, icon: Shield }];
  return <div className={`${styles.page} group-${v.team.group.toLowerCase()}`} data-player-profile={p.id} data-player-group={v.team.group} style={{ "--player-forest": `url("${assetPath("/images/matches/peten-dusk-background.webp")}")` } as CSSProperties}>
    <section className={styles.hero} aria-labelledby="player-name">
      <div className={styles.heroArt} aria-hidden="true"><picture><source media="(max-width:600px)" srcSet={mobile.srcSet} sizes="100vw" /><img {...desktop} alt="" /></picture></div>
      <div className={styles.shell}>
        <Link href={`/mundialito/equipos/${v.team.slug}`} className={styles.back}><ArrowLeft size={16} aria-hidden="true" />Volver a {v.team.name}</Link>
        <div className={styles.identity}>
          <div className={styles.avatar} aria-label="Avatar genérico, sin fotografía del jugador"><UserRound aria-hidden="true" strokeWidth={1} />{p.shirtNumber !== null && <span aria-label={`Dorsal ${p.shirtNumber}`}>{p.shirtNumber}</span>}</div>
          <div className={styles.nameBlock}><p className={styles.eyebrow}>FICHA DEL JUGADOR · GRUPO {v.team.group}</p><h1 id="player-name">{p.fullName}</h1><Link className={styles.teamLink} href={`/mundialito/equipos/${v.team.slug}`}>{v.team.name}<ArrowUpRight size={14} aria-hidden="true" /></Link>{(p.shirtNumber !== null || p.position) && <p className={styles.details}>{[p.shirtNumber !== null ? `Dorsal ${p.shirtNumber}` : "", p.position ? positions[p.position] : ""].filter(Boolean).join(" · ")}</p>}</div>
        </div>
      </div>
    </section>
    <div className={`${styles.shell} ${styles.content}`}>
      <section aria-label="Estadísticas del jugador"><dl className={styles.metrics}>{metrics.map(({label,value,icon:Icon}, i) => <div key={label} className={i === 2 ? styles.yellow : i === 3 ? styles.red : ""} data-player-stat={label}><Icon size={30} aria-hidden="true" /><dt>{label}</dt><dd>{value ?? "—"}</dd></div>)}</dl><p className={styles.coverage}>Partidos: encuentros con eventos del jugador, no todas sus participaciones. {v.complete ? "Cobertura completa de los registros disponibles." : "Cifras registradas · provisionales."} <span>— indica información aún no determinable.</span></p></section>
      <div className={styles.overview}>
        <Panel title="Información del jugador" icon={UserRound}>
          <dl className={styles.info}><div><dt>Nombre completo</dt><dd>{p.fullName}</dd></div><div><dt>Equipo</dt><dd><Link href={`/mundialito/equipos/${v.team.slug}`}>{v.team.name}</Link></dd></div><div><dt>Grupo</dt><dd><span className={styles.groupBadge}>{v.team.group}</span></dd></div>{p.shirtNumber !== null && <div><dt>Dorsal</dt><dd>{p.shirtNumber}</dd></div>}{p.position && <div><dt>Posición</dt><dd>{positions[p.position]}</dd></div>}{isUuid(p.tournamentId) && typeof p.active === "boolean" && <div><dt>Estado en nómina</dt><dd>{p.active ? "Activo" : "Inactivo"}</dd></div>}</dl>
        </Panel>
        <Panel title="Estadísticas en el torneo" icon={ChartNoAxesColumnIncreasing}>
          <p className={styles.subtitle}>Su aporte entre los registros del equipo</p>
          <div className={styles.shares}>{v.shares.map((s, i) => <div key={s.label} data-player-share={s.label}><div className={styles.shareHeading}><span>{s.label}</span><strong>{s.value ?? "—"}<small> / {s.total}</small></strong></div><div className={`${styles.track} ${i === 1 ? styles.yellowTrack : i === 2 ? styles.redTrack : ""}`} aria-hidden="true"><i style={{ width: `${s.percent ?? 0}%` }} /></div><p>{s.percent === null ? s.total === 0 ? "Sin registros del equipo para comparar" : "Aporte aún no determinable" : `${new Intl.NumberFormat("es-GT", { maximumFractionDigits: 1 }).format(s.percent)} % de ${s.total} ${s.unit} del equipo`}</p></div>)}</div>
          <p className={styles.note}>Solo partidos finalizados. El goleo excluye autogoles y tandas; el marcador oficial puede incluir correcciones administrativas.</p>
          {v.ownGoals !== null && v.ownGoals > 0 && <p className={styles.ownGoals}>Autogoles registrados: <strong>{v.ownGoals}</strong> · separados del goleo.</p>}
        </Panel>
        <Panel title="Registro disciplinario" icon={Shield}>
          <div className={styles.disciplineSummary}><Shield size={30} aria-hidden="true" /><div><strong>{v.values.points ?? "—"}</strong><span>Puntos observados</span></div><small>Provisional</small></div>
          <p className={styles.note}>Tarjetas y expulsiones registradas. Las decisiones disciplinarias externas se gestionan fuera de la plataforma.</p>
          {v.cards.length ? <ul className={styles.cardList}>{v.cards.map(e => <li key={e.id} data-player-card={e.id}><RectangleVertical size={16} className={e.kind === "yellow" ? styles.yellowInk : styles.redInk} aria-hidden="true" /><div><strong>{eventLabel(e)}</strong><Link href={`/mundialito/partidos/${encodeURIComponent(e.matchId)}`}>{(() => { const h = v.history.find(h => h.id === e.matchId); return h?.day !== null && h?.day !== undefined ? `Jornada ${h.day}` : "Ver partido"; })()}{e.minute !== undefined && <span> · {e.minute}′</span>}</Link></div></li>)}</ul> : <Empty>{v.cardsCovered ? "Sin tarjetas en los partidos revisados." : "No hay tarjetas registradas; cobertura aún parcial."}</Empty>}
        </Panel>
      </div>
      <Panel title="Historial de partidos" icon={History} className={styles.historyPanel}>
        <p className={styles.subtitle}>Encuentros finalizados con eventos registrados a nombre del jugador.</p>
        {v.history.length ? <div className={styles.historyWrap}><table className={styles.history}><thead><tr><th scope="col">Fecha / jornada</th><th scope="col">Rival</th><th scope="col">Marcador oficial</th><th scope="col">Eventos del jugador</th></tr></thead><tbody>{v.history.map(h => <tr key={h.id} data-player-match={h.id}><td><span>{h.startsAt ? <time dateTime={h.startsAt}>{date(h.startsAt)}</time> : "Fecha por definir"}</span>{h.day !== null && <small>Jornada {h.day}</small>}</td><th scope="row"><Link href={`/mundialito/equipos/${h.rival.slug}`}>{h.rival.name}</Link><small>{h.home ? "Como local" : "Como visitante"}</small></th><td><Link className={styles.score} href={`/mundialito/partidos/${encodeURIComponent(h.id)}`} aria-label={`${v.team.name} contra ${h.rival.name}, ver partido`}><strong>{h.result.homeGoals}<span>–</span>{h.result.awayGoals}</strong><span>{statusLabels[h.status]}</span></Link>{h.result.penalties && <small>Penales {h.result.penalties.home}–{h.result.penalties.away} · local/visitante</small>}<small>Orden: local – visitante</small></td><td><ul className={styles.events}>{h.events.map(e => <li key={e.id} data-player-event={e.id}><span className={e.kind === "yellow" ? styles.yellowInk : e.kind === "red" || e.kind === "second-yellow" ? styles.redInk : ""}>{eventLabel(e)}</span>{e.minute !== undefined && <small>{e.minute}′</small>}</li>)}</ul></td></tr>)}</tbody></table></div> : <Empty>Aún no hay partidos finalizados con eventos de este jugador.</Empty>}
      </Panel>
    </div>
  </div>;
}
