type Environment = Record<string, string | undefined>;
export function safeHttps(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try { const url = new URL(value.trim()); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function readSiteConfig(env: Environment) {
  const phone = env.TREVIX_WHATSAPP?.trim() ?? "";
  const whatsapp = /^\+?[1-9]\d{7,14}$/.test(phone) ? phone.replace(/^\+/, "") : null;
  const rawEmail = env.TREVIX_EMAIL?.trim() ?? "";
  const email = !/%0[ad]/i.test(rawEmail) && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(rawEmail) ? rawEmail : null;
  return { whatsapp, email, mundialitoUrl: "/mundialito", siteUrl: safeHttps(env.TREVIX_SITE_URL) ?? "https://trevix.digital" };
}
export function whatsappHref(phone: string | null, message = "Hola, TREVIX. Me gustaría recibir asesoramiento para mi proyecto.") {
  return phone && /^[1-9]\d{7,14}$/.test(phone) ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : null;
}
export type SiteConfig = ReturnType<typeof readSiteConfig>;
