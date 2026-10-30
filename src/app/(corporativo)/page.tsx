import { ContactSection } from "@/components/corporate/contact-section";
import { AboutSection } from "@/components/corporate/about-section";
import { SolutionsSection } from "@/components/corporate/solutions-section";
import { ServicesSection } from "@/components/corporate/services-section";
import { HomeHero } from "@/components/corporate/home-hero";
import Image from "next/image";
import { Goal, MoveUpRight } from "@/components/corporate/icons";
import { Header } from "@/components/corporate/header";
import { Reveal } from "@/components/corporate/reveal";
import { navigation, services } from "@/lib/corporate/content";
import { readSiteConfig } from "@/lib/corporate/config";

export default function Home() {
  const config = readSiteConfig(process.env);
  return <>
    <Header mundialitoUrl={config.mundialitoUrl} />
    <main id="contenido">
      <HomeHero />

      <ServicesSection />

      <SolutionsSection />

      <AboutSection />

      <ContactSection />
    </main>
    <footer className="footer"><div className="shell footer-grid"><div className="footer-brand"><a href="#inicio" aria-label="TREVIX, volver al inicio"><Image src="/brand/trevix-oficial.jpeg" width={640} height={640} alt="TREVIX"/></a><p>Soluciones tecnológicas<br/>para un mejor mañana.</p></div><div><h2>Explora</h2><nav aria-label="Navegación del pie de página">{navigation.map(n=><a key={n.id} href={`#${n.id}`}>{n.label}</a>)}</nav></div><div><h2>Lo que hacemos</h2><ul>{services.map(s=><li key={s.id}><a href="#servicios">{s.title}</a></li>)}</ul></div><div><h2>También nos mueve</h2><a className="footer-sport" href={config.mundialitoUrl??"#deporte"} ><Goal size={20} aria-hidden="true"/>Mundialito La Bomba 2026<MoveUpRight size={16} aria-hidden="true"/></a></div></div><div className="shell footer-bottom"><span>© {new Date().getFullYear()} TREVIX. Todos los derechos reservados.</span><a href="#inicio">Volver arriba ↑</a></div></footer>
    <Reveal/>
  </>;
}
