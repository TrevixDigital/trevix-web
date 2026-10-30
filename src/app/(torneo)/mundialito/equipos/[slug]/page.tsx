import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { tournamentRepository, getCompetitionReport, getCalendar } from "@/lib/mundialito/repositories/tournament";
import { teams } from "@/lib/mundialito/data/teams";
import { getPublicTeamRoster } from "@/lib/mundialito/players/public";
import { TeamProfile } from "./team-profile";
export const dynamicParams=false;
type Props={params:Promise<{slug:string}>};
export async function generateStaticParams(){return teams.map(({slug})=>({slug}));}
export async function generateMetadata({params}:Props):Promise<Metadata>{const team=await tournamentRepository.getTeam((await params).slug);return{title:team?.name??"Equipo no encontrado"};}
export default async function Page({params}:Props){const{slug}=await params,report=await getCompetitionReport();if(!report.calculation.data.teams.some(t=>t.slug===slug))notFound();const[roster,calendar]=await Promise.all([getPublicTeamRoster(slug),getCalendar()]);return <TeamProfile slug={slug} report={report} roster={roster} calendar={calendar}/>;}
