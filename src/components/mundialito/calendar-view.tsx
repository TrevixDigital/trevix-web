import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { getCalendar, getTournament } from "@/lib/mundialito/repositories/tournament";
import { MatchList } from "@/components/mundialito/match-list";
import { DataEmpty } from "@/components/mundialito/data-ui";
import type { CalendarDay } from "@/lib/mundialito/calendar";

function DayHeading({ day }: { day: CalendarDay }) {
  return (
    <p className="calendar-day-label">
      {day.number !== null ? `Jornada ${day.number}` : "Jornada por confirmar"}
      <span>
        {day.date
          ? new Intl.DateTimeFormat("es-GT", {
              timeZone: "UTC",
              dateStyle: "long",
            }).format(new Date(`${day.date}T12:00:00Z`))
          : "Fecha por confirmar"}
      </span>
    </p>
  );
}
export async function CalendarView({ preview = false }: { preview?: boolean }) {
  const calendar = await getCalendar();
  const snapshot = await getTournament();
  const nextIds =
    calendar.next?.matches
      .filter((m) => m.status === "scheduled")
      .map((m) => m.id) ?? [];
  const lastIds =
    calendar.last?.matches
      .filter(
        (m) =>
          m.status === "finished" &&
          snapshot.data.results.some(
            (r) => r.matchId === m.id && r.state === "confirmed",
          ),
      )
      .map((m) => m.id) ?? [];
  const next = (
    <section
      className="sports-panel calendar-feature"
      aria-labelledby="next-matchday-title"
    >
      <header className="panel-title">
        <h2 id="next-matchday-title">
          <CalendarDays size={23} aria-hidden="true" /> Próxima fecha
        </h2>
        <span className="status-pill">PROGRAMACIÓN OFICIAL</span>
      </header>
      {calendar.next ? (
        <>
          <DayHeading day={calendar.next} />
          <MatchList ids={nextIds} />
        </>
      ) : (
        <DataEmpty title="Sin próxima fecha programada">
          No hay encuentros programados para hoy o los próximos días. Consulta
          el calendario completo para ver partidos pendientes y fechas por
          confirmar.
        </DataEmpty>
      )}
      {preview && (
        <Link href="/mundialito/partidos" className="text-link calendar-more">
          Ver calendario completo <ArrowRight size={17} aria-hidden="true" />
        </Link>
      )}
    </section>
  );
  if (preview) return next;
  return (
    <div className="calendar-view">
      <div className="calendar-highlights">
        <section
          className="sports-panel calendar-feature"
          aria-labelledby="last-matchday-title"
        >
          <header className="panel-title">
            <h2 id="last-matchday-title">Última fecha disputada</h2>
          </header>
          {calendar.last && <DayHeading day={calendar.last} />}
          {lastIds.length ? (
            <MatchList ids={lastIds} />
          ) : (
            <DataEmpty title="Resultados oficiales aún no disponibles">
              Los resultados todavía no están importados. Una fecha pasada no
              significa que sus partidos hayan finalizado.
            </DataEmpty>
          )}
        </section>
        {next}
      </div>
      <details className="sports-panel full-calendar">
        <summary>
          Ver calendario completo{" "}
          <span>
            {snapshot.data.fixtures.length} partidos · Todas las jornadas
          </span>
        </summary>
        <div className="calendar-days">
          {calendar.days.length ? (
            calendar.days.map((day) => (
              <section key={day.id} className="calendar-day">
                <DayHeading day={day} />
                <MatchList ids={day.matches.map((m) => m.id)} />
              </section>
            ))
          ) : (
            <DataEmpty title="Calendario por confirmar">
              Las jornadas aparecerán cuando la organización publique su
              programación.
            </DataEmpty>
          )}
        </div>
      </details>
    </div>
  );
}
