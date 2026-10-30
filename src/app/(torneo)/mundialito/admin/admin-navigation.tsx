"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  UsersRound,
  ChartNoAxesColumnIncreasing,
  LogOut,
  ArrowUpRight,
} from "lucide-react";
import { assetPath } from "@/lib/mundialito/site";
import styles from "./admin.module.css";
const links = [
  { href: "/mundialito/admin", label: "Resumen", Icon: LayoutDashboard },
  { href: "/mundialito/admin/jugadores", label: "Jugadores", Icon: UsersRound },
  { href: "/mundialito/admin/partidos", label: "Partidos", Icon: CalendarDays },
  {
    href: "/mundialito/admin/estadisticas",
    label: "Estadísticas",
    Icon: ChartNoAxesColumnIncreasing,
  },
];
export function AdminNavigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const login = pathname === "/mundialito/admin/login";
  return (
    <>
      <header className={styles.adminHeader}>
        <Link href={login ? "/mundialito" : "/mundialito/admin"} className={styles.adminBrand}>
          <Image
            src={assetPath("/images/logo-transparent.png")}
            width={46}
            height={46}
            alt="Mundialito La Bomba 2026"
          />
          <span>
            LA BOMBA <small>ORGANIZACIÓN · 2026</small>
          </span>
        </Link>
        <div className={styles.headerActions}>
          <Link className={styles.publicLink} href="/mundialito">
            Sitio <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
          {!login && (
            <form action="/mundialito/admin/logout" method="post">
              <button className={styles.secondary} aria-label="Cerrar sesión">
                <LogOut size={17} aria-hidden="true" />
                <span className={styles.logoutText}>Salir</span>
              </button>
            </form>
          )}
        </div>
      </header>
      <div className={login ? undefined : styles.workspace}>
        {!login && (
          <aside className={styles.adminSidebar}>
            <nav
              aria-label="Navegación administrativa"
              className={styles.adminNav}
            >
              {links.map(({ href, label, Icon }) => (
                <Link
                  href={href}
                  key={href}
                  aria-current={
                    (
                      href === "/mundialito/admin"
                        ? pathname === href
                        : pathname.startsWith(`${href}/`) || pathname === href
                    )
                      ? "page"
                      : undefined
                  }
                >
                  <Icon size={20} aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
          </aside>
        )}
        <div className={styles.adminContent}>{children}</div>
      </div>
    </>
  );
}
