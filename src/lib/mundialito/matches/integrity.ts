import type { ReadRow, SupabaseCalendarRows } from "../supabase/read-types.ts";
import { KNOCKOUT_MATCHES, SOURCE_REFERENCES } from "../supabase/calendar-mapping.ts";
import { bracketDefinitions } from "../engine/bracket.ts";

export interface MatchIssue { matchId: string; number: number; code: string; message: string }
/** Stored values, never defaults or inferred results. A warning is not permission to repair. */
export function matchIntegrity(row: ReadRow): MatchIssue[] {
  const issues: MatchIssue[] = [];
  const add=(code:string,message:string)=>issues.push({matchId:String(row.id),number:Number(row.match_number),code,message});
  const score=[row.home_score,row.away_score],pens=[row.home_penalties,row.away_penalties];
  if (score.some(v=>v!==null) && score.some(v=>v===null)) add("PARTIAL_SCORE","Marcador incompleto: no se convierte NULL en cero.");
  if (row.status==="scheduled" && score.some(v=>v!==null)) add("SCHEDULED_SCORE","Programado con marcador almacenado. No cuenta para posiciones; requiere revisar acta, estado y resultado antes de corregir.");
  if (row.status==="finished" && score.some(v=>v===null)) add("FINISHED_WITHOUT_SCORE","Finalizado sin marcador completo: resultado no válido.");
  if ([...score,...pens].some(v=>v!==null && (!Number.isSafeInteger(v)||Number(v)<0))) add("INVALID_SCORE","Goles o penales inválidos.");
  if (pens.some(v=>v!==null) && (pens.some(v=>v===null)||row.phase==="groups"||row.status!=="finished"||score[0]!==score[1]||pens[0]===pens[1]))
    add("INVALID_PENALTIES","Tanda incompatible con fase, estado o marcador.");
  if(row.phase!=="groups") {
    const definition=KNOCKOUT_MATCHES[Number(row.match_number)];
    const official=bracketDefinitions.find(b=>b.id===definition?.localId);
    if(!definition||row.bracket_code!==definition.code) add("BRACKET_CODE","Número y código de llave no corresponden.");
    for(const side of ["home","away"] as const) {
      const source=row[`${side}_source`];
      // Legacy generic WIN/LOSE carries no predecessor information: report, never infer it as verified.
      if(source==="WIN"||source==="LOSE") add("GENERIC_SOURCE",`${side}: referencia ${source} genérica; falta confirmar la llave de origen explícita.`);
      else if(!official||typeof source!=="string"||SOURCE_REFERENCES[source]!==official[side]) add("BRACKET_SOURCE",`${side}: referencia no coincide con el artículo 12 y su llave oficial.`);
    }
  }
  return issues;
}
export function calendarIntegrity(rows: SupabaseCalendarRows) {
  const issues=rows.matches.flatMap(matchIntegrity);
  const numbers=rows.matches.map(m=>Number(m.match_number));
  if(rows.matches.length!==34||new Set(numbers).size!==34||Array.from({length:34},(_,i)=>i+1).some(n=>!numbers.includes(n)))
    issues.push({matchId:"",number:0,code:"CALENDAR_COUNT",message:"Deben existir exactamente los 34 números oficiales sin duplicados."});
  return {issues,requiresReview:issues.length>0};
}
export function storedScoreLabel(row: ReadRow) {
  return row.home_score===null||row.away_score===null ? "Sin marcador registrado (NULL)" : `${row.home_score} – ${row.away_score}`;
}
