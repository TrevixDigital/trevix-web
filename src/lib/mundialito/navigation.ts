export const navigationLinks = [
  { href: "/mundialito", label: "Inicio" },
  { href: "/mundialito/grupos", label: "Grupos" },
  { href: "/mundialito/partidos", label: "Partidos" },
  { href: "/mundialito/eliminatorias", label: "Eliminatorias" },
  { href: "/mundialito/fase-final", label: "Fase Final" },
  { href: "/mundialito/equipos", label: "Equipos" },
  { href: "/mundialito/estadisticas", label: "Estadísticas" },
] as const;

/** A section includes its detail pages, never another route sharing its prefix. */
export function isNavigationActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/mundialito" && pathname.startsWith(`${href}/`));
}
