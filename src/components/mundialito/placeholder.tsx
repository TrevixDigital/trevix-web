import Link from "next/link";
import { ArrowRight, CalendarClock, LockKeyhole } from "lucide-react";
import { Hero } from "@/components/mundialito/hero";
import { SectionHeading } from "@/components/mundialito/section-heading";
export function Placeholder({
  label,
  title,
  description,
  admin = false,
  heroTitle,
}: {
  label: string;
  title: string;
  description: string;
  admin?: boolean;
  heroTitle?: string;
}) {
  const Icon = admin ? LockKeyhole : CalendarClock;
  return (
    <>
      <Hero compact title={heroTitle ?? title.toLocaleUpperCase("es-GT")} />
      <section className="shell section">
        <SectionHeading label={label} title={title} description={description} />
        <div className="empty-state">
          <div className="empty-icon">
            <Icon size={32} strokeWidth={1.5} />
          </div>
          <span className="status-pill">
            {admin ? "ACCESO NO HABILITADO" : "PRÓXIMAMENTE"}
          </span>
          <h3>
            {admin
              ? "Administración reservada"
              : "La emoción está por comenzar"}
          </h3>
          <p>
            {admin
              ? "El panel estará disponible cuando se implementen la autenticación y los permisos de acceso."
              : "Publicaremos la información oficial en esta sección cuando esté disponible."}
          </p>
          <Link href="/mundialito/grupos" className="text-link">
            Conocer los grupos <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </>
  );
}
