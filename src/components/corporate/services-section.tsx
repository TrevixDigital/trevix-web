import Image from "next/image";
import { ArrowRight, ChartNoAxesCombined, Check, CodeXml, Globe2, Headphones, Lightbulb, Settings2, ShieldCheck, UsersRound } from "@/components/corporate/icons";
import { services } from "@/lib/corporate/content";
import { ServiceInquiryLink } from "@/components/corporate/service-interest";

const icons = [Lightbulb, CodeXml, ChartNoAxesCombined, Globe2];
const benefits = [
  { icon: Settings2, title: "Soluciones personalizadas", text: "Adaptadas a tus necesidades." },
  { icon: ShieldCheck, title: "Tecnología segura y confiable", text: "Para un mejor rendimiento." },
  { icon: Headphones, title: "Soporte continuo", text: "Antes, durante y después." },
  { icon: UsersRound, title: "Acompañamiento en cada proyecto", text: "Tu crecimiento es nuestro objetivo." },
];

export function ServicesSection() {
  return <section id="servicios" className="services premium-services section-anchor" aria-labelledby="services-title">
    <div className="services-ambience" aria-hidden="true" />
    <div className="services-shell">
      <header className="section-intro" data-reveal>
        <div><p className="eyebrow dark">NUESTROS SERVICIOS</p><h2 id="services-title">Todo lo que tu negocio<br className="services-title-break" /> necesita <em>en un solo lugar</em></h2></div>
        <p>Te acompañamos en cada paso con soluciones tecnológicas confiables, seguras y adaptadas a tus necesidades.</p>
      </header>
      <div className="service-grid">
        {services.map((service, index) => {
          const Icon = icons[index];
          return <article className="service-card" key={service.id} aria-labelledby={`service-${service.id}`} data-reveal>
            <div className="service-photo">
              <Image src={index === 0 ? "/images/servicios/advisory-premium.webp" : `/images/service-${service.image}.webp`} width={1000} height={625} sizes="(max-width:639px) 100vw, (max-width:1279px) 50vw, 25vw" alt="" />
              <span className="service-number" aria-label={`Servicio ${service.number}`}>{service.number}</span>
            </div>
            <div className="service-body">
              <span className="service-icon"><Icon size={31} strokeWidth={1.7} aria-hidden="true" /></span>
              <h3 id={`service-${service.id}`}>{service.title}</h3>
              <p>{service.description}</p>
              <ul>{service.benefits.map(benefit => <li key={benefit}><span className="service-check"><Check size={12} strokeWidth={2.7} aria-hidden="true" /></span>{benefit}</li>)}</ul>
            </div>
            <ServiceInquiryLink serviceId={service.id} title={service.title}>Hablemos de tu proyecto<span className="service-arrow"><ArrowRight size={23} strokeWidth={1.8} aria-hidden="true" /></span></ServiceInquiryLink>
          </article>;
        })}
      </div>
      <div className="services-benefits" aria-label="Nuestro compromiso con tu proyecto" data-reveal>
        {benefits.map(({ icon: Icon, title, text }) => <div key={title}><Icon size={49} strokeWidth={1.7} aria-hidden="true" /><p><strong>{title}</strong><span>{text}</span></p></div>)}
      </div>
    </div>
  </section>;
}
