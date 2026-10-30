import Image, { getImageProps } from "next/image";
import { ArrowDown, ArrowRight, Building2, Headphones, Landmark, TrendingUp, UsersRound } from "@/components/corporate/icons";

const audiences = [
  { icon: Building2, title: "Empresas", detail: "y negocios" },
  { icon: Landmark, title: "Instituciones", detail: "y organizaciones" },
  { icon: UsersRound, title: "Emprendedores", detail: "y profesionales" },
  { icon: Headphones, title: "Atención", detail: "personalizada" },
  { icon: TrendingUp, title: "Tecnología", detail: "para tu crecimiento" },
];

export function HomeHero() {
  const { props: desktop } = getImageProps({ src: "/images/inicio/office-premium.webp", width: 1672, height: 940, sizes: "100vw", alt: "", loading: "eager", fetchPriority: "high", unoptimized: true });
  return <section id="inicio" className="hero premium-hero section-anchor" aria-labelledby="hero-title">
    <div className="hero-art" aria-hidden="true">
      <picture><source media="(max-width: 900px)" srcSet="/images/inicio/office-premium-mobile.webp" /><img {...desktop} alt="" /></picture>
      <Image className="hero-monitor-logo" src="/brand/trevix-logo.png" width={1320} height={1191} sizes="(max-width:900px) 70px, 140px" alt="" />
    </div>
    <div className="shell hero-content">
      <p className="eyebrow"><span />TECNOLOGÍA QUE IMPULSA TU CRECIMIENTO</p>
      <h1 id="hero-title">Soluciones <br />tecnológicas <em>para un <br />mejor mañana</em></h1>
      <p className="hero-description">Asesoramiento, desarrollo e implementación de soluciones que hacen tu trabajo más eficiente, seguro y profesional.</p>
      <a className="button primary hero-cta" href="#servicios">Conoce nuestros servicios<ArrowRight size={24} aria-hidden="true" /></a>
      <p className="hero-footnote">Tu próximo paso comienza con una buena solución.</p>
    </div>
    <div className="shell audience-band" aria-label="Soluciones y atención para cada proyecto">
      {audiences.map(({ icon: Icon, title, detail }) => <div key={title}><Icon size={44} strokeWidth={1.45} aria-hidden="true" /><p><strong>{title}</strong><span>{detail}</span></p></div>)}
    </div>
    <a className="hero-scroll" href="#servicios" aria-label="Desplazarse a Servicios"><span /><span className="scroll-mouse" aria-hidden="true"><i /></span><span /><ArrowDown size={15} aria-hidden="true" /></a>
  </section>;
}
