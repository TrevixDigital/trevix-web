"use client";
import { useActionState, useState } from "react";
import { cardOutcome } from "@/lib/mundialito/events/cards";
import { goalTotals, type PlayerTotals, type SimpleSaveState } from "@/lib/mundialito/events/simple-acta";
import { statusLabels, type MatchValues } from "@/lib/mundialito/matches/model";
import styles from "../admin.module.css";

export interface SimpleFormProps {
  save: (state: SimpleSaveState, form: FormData) => Promise<SimpleSaveState>;
  values: MatchValues;
  phase: string;
  teams: {id:string;name:string}[];
  players: {id:string;fullName:string;teamId:string;active:boolean}[];
  initialTotals: PlayerTotals[];
  writable: boolean;
  exceptionalCards: string[];
}
export function SimpleMatchForm({save,values,phase,teams,players,initialTotals,writable,exceptionalCards}: SimpleFormProps) {
  const [initialSave]=useState(()=>save);
  const [state,action,pending]=useActionState(initialSave,{error:"",completed:[]} as SimpleSaveState);
  const [totals,setTotals]=useState(initialTotals);
  const [status,setStatus]=useState(values.status);
  const [home,setHome]=useState(String(values.home_score??"")),[away,setAway]=useState(String(values.away_score??""));
  const [homePen,setHomePen]=useState(String(values.home_penalties??"")),[awayPen,setAwayPen]=useState(String(values.away_penalties??""));
  const locked=pending||!!state.success||!!state.retryOnly;
  const update=(teamId:string,playerId:string|null,field:keyof Pick<PlayerTotals,"goals"|"ownGoals"|"yellows"|"directReds">,value:string)=>
    setTotals(old=>old.map(r=>r.teamId===teamId&&r.playerId===playerId?{...r,[field]:value===""?NaN:Number(value)}:r));
  const score=goalTotals(totals,teams);
  const invalid=totals.some(r=>![r.goals,r.ownGoals,r.yellows,r.directReds].every(n=>Number.isSafeInteger(n)&&n>=0)||r.yellows===2&&r.directReds===1);
  const mismatch=home!==""&&away!==""&&(Number(home)!==score[0]||Number(away)!==score[1]);
  function number(teamId:string,playerId:string|null,field:"goals"|"ownGoals",label:string,value:number) {
    return <label className={styles.simpleControl}>{field==="goals"?"Goles":label}<input type="number" inputMode="numeric" min={0} step={1} value={Number.isNaN(value)?"":value} disabled={locked} required aria-label={label} onChange={e=>update(teamId,playerId,field,e.target.value)}/></label>;
  }
  return <form action={action} className={`${styles.form} ${styles.formPanel}`} aria-busy={pending}>
    <input type="hidden" name="totals" value={JSON.stringify(totals)}/>
    <input type="hidden" name="status" value={status}/><input type="hidden" name="home_score" value={home}/><input type="hidden" name="away_score" value={away}/>
    <input type="hidden" name="home_penalties" value={homePen}/><input type="hidden" name="away_penalties" value={awayPen}/>
    <h2>Resultado y estadísticas</h2>
    <label htmlFor="simple-status">Estado del partido</label>
    <select id="simple-status" value={status} disabled={locked} onChange={e=>setStatus(e.target.value as MatchValues["status"])}>
      {(["scheduled","live","finished"] as const).map(s=><option key={s} value={s}>{statusLabels[s]}</option>)}
      {!["scheduled","live","finished"].includes(values.status)&&<option value={values.status}>{statusLabels[values.status]}</option>}
    </select>
    <div className={styles.simpleScore}>
      <label>{teams[0]?.name??"Local"}<input aria-label="Marcador local" type="number" inputMode="numeric" min={0} step={1} value={home} placeholder="Sin marcador" disabled={locked} onChange={e=>setHome(e.target.value)}/></label>
      <span aria-hidden="true">–</span>
      <label>{teams[1]?.name??"Visitante"}<input aria-label="Marcador visitante" type="number" inputMode="numeric" min={0} step={1} value={away} placeholder="Sin marcador" disabled={locked} onChange={e=>setAway(e.target.value)}/></label>
    </div>
    {phase!=="groups"&&<details open={homePen!==""||awayPen!==""}><summary>Penales de desempate, si corresponde</summary><div className={styles.simpleScore}>
      <label>Penales local<input type="number" min={0} step={1} value={homePen} disabled={locked} onChange={e=>setHomePen(e.target.value)}/></label><span>–</span>
      <label>Penales visitante<input type="number" min={0} step={1} value={awayPen} disabled={locked} onChange={e=>setAwayPen(e.target.value)}/></label>
    </div><p className={styles.hint}>La tanda no se suma a los goles de los jugadores.</p></details>}
    <p className={styles.hint}>Escribe la cantidad total de cada jugador. No necesitas registrar minutos. Los minutos y las notas existentes se conservan en los registros que permanecen.</p>
    {!writable&&<p className={styles.notice}>El guardado de tarjetas está desactivado. Puedes consultar las cantidades existentes.</p>}
    {teams.map(team=><section className={styles.simpleTeam} key={team.id} aria-label={`Jugadores de ${team.name}`}>
      <h3>{team.name}</h3>
      <div className={styles.simpleTableHead} aria-hidden="true"><span>Jugador</span><span>Goles</span><span>Amarillas</span><span>Roja directa</span></div>
      {players.filter(p=>p.teamId===team.id).map(p=>{
        const row=totals.find(r=>r.playerId===p.id)!;
        let outcome="";try{outcome=cardOutcome(row.yellows,row.directReds).label;}catch{outcome="Dos amarillas y roja directa: revisa las cantidades.";}
        const exceptional=exceptionalCards.includes(p.id);
        return <div className={styles.simplePlayer} key={p.id}>
          <div className={styles.simplePlayerName}><strong>{p.fullName}</strong>{!p.active&&<small>Ficha inactiva · revisar elegibilidad</small>}</div>
          {number(team.id,p.id,"goals",`Goles de ${p.fullName}`,row.goals)}
          <label className={styles.simpleControl}>Amarillas<select aria-label={`Amarillas de ${p.fullName}`} value={row.yellows} disabled={locked||!writable||exceptional} onChange={e=>update(team.id,p.id,"yellows",e.target.value)}>{[0,1,2].map(n=><option key={n} value={n}>{n}</option>)}{row.yellows>2&&<option value={row.yellows}>{row.yellows}</option>}</select></label>
          <label className={styles.simpleControl}>Roja directa<select aria-label={`Roja directa de ${p.fullName}`} value={row.directReds} disabled={locked||!writable||exceptional} onChange={e=>update(team.id,p.id,"directReds",e.target.value)}>{[0,1].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
          {(row.yellows>0||row.directReds>0||exceptional)&&<small className={styles.simpleOutcome}>{exceptional?"Tarjetas históricas pendientes de revisión; se conservarán sin cambios.":outcome}</small>}
        </div>;
      })}
      {!players.some(p=>p.teamId===team.id)&&<p className={styles.notice}>Este equipo no tiene jugadores registrados. Ficha sus jugadores para asignar goles y tarjetas; el marcador puede guardarse por separado.</p>}
      <details className={styles.simpleExtras}><summary>Autogoles de {team.name}</summary><p className={styles.hint}>Se suman al marcador del rival y no a la tabla de goleadores.</p>
        {totals.filter(r=>r.teamId===team.id).map(r=><div key={r.playerId??"unknown"}>{number(team.id,r.playerId,"ownGoals",r.playerId?`Autogoles de ${players.find(p=>p.id===r.playerId)!.fullName}`:"Autogoles sin autor identificado",r.ownGoals)}</div>)}
      </details>
    </section>)}
    {invalid&&<p role="alert" className={styles.error}>Revisa las cantidades. Dos amarillas producen expulsión por doble amarilla; no añadas una roja directa.</p>}
    {mismatch&&<p className={styles.notice}>Marcador oficial {home}–{away}; goles individuales {score[0]}–{score[1]}. Puedes guardar una corrección administrativa con esta diferencia. No se crearán goles para cuadrar el resultado.</p>}
    {state.error&&<div role="alert" className={styles.error}><strong>No se completó el guardado.</strong><p>{state.error}</p><p>{state.retryOnly?"Las cantidades quedan conservadas para reintentar. Para corregirlas, recarga y revisa primero lo que ya está guardado.":"Corrige los datos y vuelve a guardar. No se inició ninguna escritura."}</p></div>}
    {state.completed.length>0&&<div className={styles.notice}><strong>Confirmado en Supabase</strong><ul>{[...new Set(state.completed)].map(c=><li key={c}>{c}</li>)}</ul></div>}
    {state.warnings?.map(w=><p key={w} className={styles.notice}>{w}</p>)}
    {state.success&&<p role="status" className={styles.success}>Partido y estadísticas guardados. La clasificación y las estadísticas públicas se actualizan con los datos registrados.</p>}
    <div className={styles.formActions}>
      {!state.success&&<button className={styles.primary} type="submit" disabled={pending||invalid||teams.length!==2}>{pending?"Guardando partido…":state.retryOnly?"Reintentar las mismas cantidades":"Guardar partido y estadísticas"}</button>}
      <button type="button" className={styles.secondary} disabled={pending} onClick={()=>{window.location.reload();}}> {state.success?"Continuar editando":"Recargar datos guardados"}</button>
    </div>
  </form>;
}
