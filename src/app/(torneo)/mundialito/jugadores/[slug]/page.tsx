import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCalendar, getTournament } from "@/lib/mundialito/repositories/tournament";
import { getPublicPlayer } from "@/lib/mundialito/players/public";
import { PlayerProfile } from "./player-profile";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await getPublicPlayer((await params).slug);
  return { title: profile?.player.fullName ?? "Jugador no encontrado" };
}
export default async function Page({ params }: Props) {
  const { slug } = await params;
  const profile = await getPublicPlayer(slug);
  if (!profile) notFound();
  if (slug !== profile.canonical) redirect(`/mundialito/jugadores/${profile.canonical}`);
  const [snapshot, calendar] = await Promise.all([getTournament(), getCalendar()]);
  return <PlayerProfile player={profile.player} teamSlug={profile.teamSlug} snapshot={snapshot} calendar={calendar} />;
}
