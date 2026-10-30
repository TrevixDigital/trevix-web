"use client";
import { useActionState, useState } from "react";
import type { ClassificationFormState } from "./classification-actions";
import styles from "../admin.module.css";
export function ClassificationForm({save,teams,alternatives,enabled,publish=false,blockedReason}:{
  save:(state:ClassificationFormState,form:FormData)=>Promise<ClassificationFormState>;
  teams:{id:string;name:string}[];alternatives?:{label:string}[];enabled:boolean;publish?:boolean;blockedReason?:string;
}) {
  const [initialSave]=useState(()=>save);
  const [state,action,pending]=useActionState(initialSave,{error:""});
  const [order,setOrder]=useState<string[]>(teams.map(()=>""));
  const [alternative,setAlternative]=useState("");
  const valid=publish||(alternatives?alternative!=="":order.every(Boolean)&&new Set(order).size===teams.length);
  return <form action={action} className={styles.form} aria-busy={pending}>
    {!publish&&(alternatives?<label>Asignación obtenida en el sorteo<select name="alternative" required value={alternative} onChange={e=>setAlternative(e.target.value)} disabled={pending||!enabled}><option value="">Selecciona el resultado</option>{alternatives.map((a,i)=><option key={i} value={i}>{a.label}</option>)}</select></label>:
      teams.map((_,i)=><label key={i}>Posición {i+1} en el sorteo<select name="ordered" required value={order[i]} disabled={pending||!enabled} onChange={e=>setOrder(old=>old.map((v,index)=>index===i?e.target.value:v))}><option value="">Selecciona un equipo</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>))}
    {!publish&&<label>Referencia del acta del sorteo<input name="reference" required maxLength={1000} placeholder="Acta, fecha o referencia del documento" disabled={pending||!enabled}/></label>}
    {!enabled&&<p className={styles.notice}>{blockedReason??"La escritura de clasificación está desactivada. El circuito está preparado para su activación autorizada."}</p>}
    {state.error&&<p role="alert" className={styles.error}>{state.error}</p>}
    {state.warnings?.map(w=><p key={w} className={styles.notice}>{w}</p>)}
    {state.success?<p role="status" className={styles.success}>{state.success}</p>:<button className={styles.primary} type="submit" disabled={pending||!enabled||!valid}>{pending?"Guardando…":publish?"Confirmar y publicar clasificados y octavos":"Guardar resultado del sorteo"}</button>}
  </form>;
}
