import { getCompetitionReport } from "@/lib/mundialito/repositories/tournament";
import { ThirdsStandings } from "@/app/(torneo)/mundialito/grupos/standings-view";

export async function ThirdsTable() {
  return <ThirdsStandings report={await getCompetitionReport()} />;
}
