import type { Metadata, Viewport } from "next";
import { readSiteConfig } from "@/lib/corporate/config";
import "./globals.css";
import "./home-premium.css";
import "./services-premium.css";
import "./solutions-premium.css";
import "./about-premium.css";
import "./contact-premium.css";
const config=readSiteConfig(process.env);
export const metadata: Metadata = {
  metadataBase: new URL(config.siteUrl),
  title: "TREVIX | Soluciones tecnológicas para un mejor mañana",
  applicationName: "TREVIX",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "TREVIX", statusBarStyle: "black-translucent" },
  icons: { icon: [{ url: "/icons/trevix-transparent-v2.ico", sizes: "any" }, { url: "/icons/favicon-32-transparent.png", sizes: "32x32", type: "image/png" }, { url: "/icons/favicon-16-transparent.png", sizes: "16x16", type: "image/png" }], apple: [{ url: "/icons/apple-touch-icon-light.png", sizes: "180x180" }] },
  description: "Asesoramiento tecnológico, sistemas personalizados, implementación contable, páginas web y soporte. Tecnología que acompaña a negocios, organizaciones y emprendedores.",
  openGraph: {title:"TREVIX — Tecnología con propósito",description:"Soluciones tecnológicas para un mejor mañana.",type:"website",locale:"es_GT",images:[{url:"/images/inicio/office-premium.webp",width:1672,height:940,alt:"Espacio tecnológico ilustrativo de TREVIX"}]},
  robots: {index:false,follow:false},
};
export const viewport: Viewport = { themeColor: "#031421", colorScheme: "dark light" };
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="es"><body><a className="skip-link" href="#contenido">Saltar al contenido</a>{children}</body></html>;}
