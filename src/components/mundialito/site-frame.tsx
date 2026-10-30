"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MapPin, ArrowUpRight } from "lucide-react";
import { Navigation } from "@/components/mundialito/navigation";
/** Public markup is unchanged; admin has its own navigation and no public chrome. */
export function SiteFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/mundialito/admin" || pathname.startsWith("/mundialito/admin/"))
    return <main id="contenido">{children}</main>;
  return (
    <>
      <a href="#contenido" className="skip-link">
        Saltar al contenido
      </a>
      <Navigation />
      <main id="contenido">{children}</main>
      <footer className="site-footer">
        <div className="shell footer-inner">
          <div>
            <strong>
              MUNDIALITO <span>LA BOMBA 2026</span>
            </strong>
            <p>
              <MapPin size={13} /> La Bomba, La Libertad, Petén · Guatemala
            </p>
          </div>
          <div className="footer-links">
            {/* Cross-zone navigation must reload the corporate application. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">Volver a TREVIX</a>
            <span>Fútbol. Amistad. Pasión.</span>
            <Link href="/mundialito/admin">
              Administración <ArrowUpRight size={13} />
            </Link>
          </div>
        </div>
        <div className="shell footer-bottom">
          © 2026 Mundialito La Bomba. Todos los derechos reservados.
        </div>
      </footer>
    </>
  );
}
