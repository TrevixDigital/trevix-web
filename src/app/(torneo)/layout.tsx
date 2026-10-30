import type { Metadata } from "next";
import { SiteFrame } from "@/components/mundialito/site-frame";
import type { CSSProperties } from "react";
import { assetPath } from "@/lib/mundialito/site";
import "./mundialito/globals.css";
export const metadata: Metadata = {
  title: {
    default: "Mundialito La Bomba 2026 | Fútbol en Petén",
    template: "%s | Mundialito La Bomba 2026",
  },
  description:
    "Sitio oficial del Mundialito La Bomba 2026. Conoce los 18 equipos y los seis grupos del torneo en La Bomba, La Libertad, Petén, Guatemala.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-GT">
      <body
        style={
          {
            "--stadium-backdrop": `url("${assetPath("/images/cinematic/stadium-backdrop.webp")}")`,
          } as CSSProperties
        }
      >
        <SiteFrame>{children}</SiteFrame>
      </body>
    </html>
  );
}
