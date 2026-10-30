import Link from "next/link";
import {
  UsersRound,
  Trophy,
  CalendarDays,
  CheckCircle2,
  LockKeyhole,
  ArrowUpRight,
} from "lucide-react";
import { requireAdministrator } from "@/lib/mundialito/admin/server";
import { readAdminDashboard } from "@/lib/mundialito/admin/dashboard";
import styles from "./admin.module.css";
export default async function AdminPage() {
  const client = await requireAdministrator();
  let counts: Awaited<ReturnType<typeof readAdminDashboard>> | null = null;
  try {
    counts = await readAdminDashboard(client);
  } catch {
    /* Do not publish fake zeroes or local fallback data. */
  }
  const metrics = counts
    ? [
        { title: "Equipos oficiales", value: counts.teams, Icon: UsersRound },
        { title: "Grupos", value: counts.groups, Icon: Trophy },
        {
          title: "Partidos programados",
          value: counts.scheduled,
          Icon: CalendarDays,
        },
        {
          title: "Partidos finalizados",
          value: counts.finished,
          Icon: CheckCircle2,
        },
      ]
    : [];
  return (
    <section className={styles.dashboard}>
      <header className={styles.topbar}>
        <div>
          <p className={styles.eyebrow}>MUNDIALITO LA BOMBA · 2026</p>
          <h1>Panel de organización</h1>
        </div>
      </header>
      <div className={styles.verified}>
        <LockKeyhole size={17} aria-hidden="true" />
        <span>Sesión verificada · Acceso administrativo autorizado</span>
      </div>
      <section aria-labelledby="summary-title">
        <h2 id="summary-title">El torneo, de un vistazo</h2>
        <p className={styles.hint}>
          Datos de Supabase delimitados al Mundialito La Bomba 2026.
        </p>
        {counts ? (
          <div className={styles.metrics}>
            {metrics.map(({ title, value, Icon }) => (
              <article className={styles.metric} key={title}>
                <Icon size={22} aria-hidden="true" />
                <strong>{value}</strong>
                <span>{title}</span>
              </article>
            ))}
          </div>
        ) : (
          <p role="alert" className={styles.notice}>
            No se pudieron leer los datos completos del torneo. Revisa los
            permisos de lectura y vuelve a cargar la página. No se utilizan
            datos de demostración.
          </p>
        )}
      </section>
      <section aria-labelledby="modules-title">
        <h2 id="modules-title">Módulos del torneo</h2>
        <div className={styles.modules}>
          {[
            ["Partidos", "Calendario, marcadores y seguimiento de encuentros."],
            ["Jugadores", "Plantillas oficiales y registro de participación."],
            ["Estadísticas", "Goleadores y disciplina del torneo."],
          ].map(([title, text]) => (
            <article className={styles.module} key={title}>
              <span className={styles.badge}>
                {title === "Estadísticas" ? "PRÓXIMAMENTE" : "DISPONIBLE"}
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
              <Link
                href={
                  title === "Jugadores"
                    ? "/mundialito/admin/jugadores"
                    : title === "Partidos"
                      ? "/mundialito/admin/partidos"
                      : "/mundialito/admin/estadisticas"
                }
                className={styles.backLink}
              >
                {title === "Jugadores"
                  ? "Gestionar nóminas →"
                  : title === "Partidos"
                    ? "Gestionar partidos →"
                    : "Ver módulo pendiente →"}
              </Link>
            </article>
          ))}
        </div>
      </section>
      <Link href="/mundialito" className={styles.backLink}>
        Ver sitio público <ArrowUpRight size={18} aria-hidden="true" />
      </Link>
      <Link href="/mundialito/admin/reglamento" className={styles.backLink}>
        Control reglamentario, actas pendientes y cruces →
      </Link>
    </section>
  );
}
