export type AdminAccess = "anonymous" | "denied" | "allowed" | "unavailable";
export interface AdminIdentitySource {
  getVerifiedUser(): Promise<{ user: { id: string } | null; error: unknown }>;
  isAdmin(): Promise<{ data: unknown; error: unknown }>;
}
/** Never authorize from cookie contents, browser input, email or session.user. */
export async function checkAdminAccess(
  source: AdminIdentitySource,
): Promise<AdminAccess> {
  try {
    const verified = await source.getVerifiedUser();
    if (verified.error || !verified.user?.id) return "anonymous";
    const permission = await source.isAdmin();
    if (permission.error) return "unavailable";
    return permission.data === true ? "allowed" : "denied";
  } catch {
    return "unavailable";
  }
}

export const ADMIN_COOKIE = "mundialito-admin-auth";
export function adminCookieOptions(production: boolean, basePath = "") {
  return {
    name: ADMIN_COOKIE,
    httpOnly: true,
    secure: production,
    sameSite: "lax" as const,
    path: `${basePath}/admin`,
  };
}
export function isAdminCookie(name: string) {
  return (
    name === ADMIN_COOKIE || new RegExp(`^${ADMIN_COOKIE}\\.\\d+$`).test(name)
  );
}
export function adminCookieDeletions(
  names: string[],
  production: boolean,
  basePath = "",
) {
  return names
    .filter(isAdminCookie)
    .map((name) => ({
      ...adminCookieOptions(production, basePath),
      name,
      value: "",
      maxAge: 0,
    }));
}
export function isPublicAdminPath(path: string) {
  return path === "/admin/login" || path === "/admin/logout";
}
export function isSameOrigin(origin: string | null, expected: string) {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(expected).origin;
  } catch {
    return false;
  }
}
/** Use the browser's Host authority, not the dev listener (which may be 0.0.0.0). */
export function isSameRequestOrigin(
  origin: string | null,
  host: string | null,
  protocol: string,
) {
  if (
    !host ||
    !/^[a-z0-9.\-\[\]:]+$/i.test(host) ||
    !["http:", "https:"].includes(protocol)
  )
    return false;
  return isSameOrigin(origin, `${protocol}//${host}`);
}
