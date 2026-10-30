"use client";
import { useRef, useState, type ReactNode } from "react";
import { CircleDot, RectangleVertical, UsersRound } from "lucide-react";
import styles from "./statistics.module.css";
const categories=[{key:"goals",label:"Goleadores",icon:CircleDot},{key:"yellow",label:"Tarjetas amarillas",icon:RectangleVertical},{key:"red",label:"Tarjetas rojas",icon:RectangleVertical},{key:"teams",label:"Equipos",icon:UsersRound}] as const;
export type StatisticsCategory=typeof categories[number]["key"];
export function StatisticsTabs({panels}:{panels:Record<StatisticsCategory,ReactNode>}) {
  const [active,setActive]=useState<StatisticsCategory>("goals"),buttons=useRef<(HTMLButtonElement|null)[]>([]);
  return <><div className={styles.tabs} role="tablist" aria-label="Categorías de estadísticas">{categories.map(({key,label,icon:Icon},index)=><button key={key} ref={el=>{buttons.current[index]=el;}} type="button" role="tab" id={`statistics-tab-${key}`} aria-controls={`statistics-panel-${key}`} aria-selected={active===key} tabIndex={active===key?0:-1} className={styles.tab} onClick={()=>setActive(key)} onKeyDown={event=>{let next:number;if(event.key==="ArrowRight")next=(index+1)%categories.length;else if(event.key==="ArrowLeft")next=(index+categories.length-1)%categories.length;else if(event.key==="Home")next=0;else if(event.key==="End")next=categories.length-1;else return;event.preventDefault();setActive(categories[next].key);buttons.current[next]?.focus();}}><Icon size={21} aria-hidden="true" className={key==="yellow"?styles.yellowIcon:key==="red"?styles.redIcon:undefined}/><span>{label}</span></button>)}</div>{categories.map(({key})=><div key={key} className={styles.tabPanel} role="tabpanel" id={`statistics-panel-${key}`} aria-labelledby={`statistics-tab-${key}`} hidden={active!==key} tabIndex={0}>{panels[key]}</div>)}</>;
}
