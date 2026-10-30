import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "TREVIX — Soluciones tecnológicas",
    short_name: "TREVIX",
    description: "Asesoramiento, desarrollo e implementación de soluciones tecnológicas para un mejor mañana.",
    lang: "es-GT",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#020f1b",
    theme_color: "#031421",
    icons: [
      { src: "/icons/icon-192-transparent.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-transparent.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512-light.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Servicios TREVIX", short_name: "Servicios", url: "/#servicios", icons: [{ src: "/icons/icon-192-transparent.png", sizes: "192x192" }] },
      { name: "Contacto TREVIX", short_name: "Contacto", url: "/#contacto", icons: [{ src: "/icons/icon-192-transparent.png", sizes: "192x192" }] },
    ],
  };
}
