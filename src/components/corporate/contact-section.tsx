import Image from "next/image";
import { ArrowRight, Building2, ChartNoAxesCombined, Clock3, MessageSquareText, Settings2, ShieldCheck } from "@/components/corporate/icons";
import { SelectedService } from "@/components/corporate/service-interest";

const contactBenefits = [
  { title: "Asesoramiento claro", description: "Sin complicaciones.", icon: MessageSquareText },
  { title: "Atención 24/7", description: "Consultas disponibles por WhatsApp.", icon: Clock3 },
  { title: "Tu proyecto en buenas manos", description: "Compromiso y seriedad.", icon: ShieldCheck },
];
const closingBenefits = [
  { title: "Soluciones tecnológicas", description: "Para diversos sectores.", icon: Settings2 },
  { title: "Empresas, instituciones y emprendedores", description: "Soluciones adaptadas a sus necesidades.", icon: Building2 },
  { title: "Acompañamiento en cada proyecto", description: "Tu crecimiento es nuestro objetivo.", icon: ChartNoAxesCombined },
  { title: "Tecnología segura y confiable", description: "Para un mejor rendimiento.", icon: ShieldCheck },
];

function WhatsAppIcon() {
  return <svg width="48" height="48" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 3.3a12.1 12.1 0 0 0-10.4 18.3L4 28l6.7-1.8A12.1 12.1 0 1 0 16 3.3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M12.2 9.3c-.3-.7-.6-.7-1-.7h-.8c-.4 0-.8.2-1.1.5-.9.9-1.2 2-1 3.2.4 2.2 2.2 4.8 4.4 6.7 2.2 1.9 4.9 3.1 6.7 3 .9 0 2.2-.9 2.5-1.7.2-.5.3-1.1.1-1.3l-3.4-1.6c-.3-.1-.5-.1-.7.2l-1.2 1.5c-.2.2-.4.3-.7.1-2.3-1-4.1-2.6-5.2-4.7-.2-.3-.1-.5.1-.7l1-1.1c.2-.3.3-.5.1-.8l-1-2.6Z" fill="currentColor" /></svg>;
}

export function ContactSection() {
  return <section id="contacto" className="premium-contact section-anchor" aria-labelledby="contact-title">
    <div className="contact-premium-main">
      <div className="contact-premium-scene"><Image src="/images/contacto/contact-workspace.webp" fill sizes="100vw" alt="Escena conceptual de una laptop y un teléfono sobre un escritorio, con la ciudad al atardecer" /></div>
      <div className="contact-premium-inner"><div className="contact-premium-copy">
        <p className="contact-premium-kicker"><span />HABLEMOS DE TU PROYECTO</p>
        <h2 id="contact-title">Tu próxima idea<br />merece <em>un buen comienzo.</em></h2>
        <p className="contact-premium-description">Cuéntanos qué necesitas. Encontraremos contigo el camino para hacer tu trabajo más eficiente, seguro y profesional.</p>
        <SelectedService />
        <a className="whatsapp-premium-card" href="https://wa.me/50240218091" target="_blank" rel="noopener noreferrer" aria-label="Escribir a TREVIX por WhatsApp al +502 4021 8091 (abre una pestaña nueva)" aria-describedby="contact-availability">
          <span className="whatsapp-premium-icon"><WhatsAppIcon /></span>
          <span className="whatsapp-premium-details"><span className="whatsapp-premium-label">WHATSAPP</span><strong>Hablemos de tu proyecto</strong><span className="whatsapp-premium-number">+502 4021 8091</span><span className="whatsapp-premium-availability"><span />Atención disponible 24/7</span></span>
          <span className="whatsapp-premium-arrow"><ArrowRight size={26} aria-hidden="true" /></span>
        </a>
        <p id="contact-availability" className="contact-chatbot-note">Atención 24/7 asistida por chatbot en WhatsApp.</p>
        <div className="contact-premium-benefits">{contactBenefits.map(({ title, description, icon: Icon }) => <div key={title}><Icon size={36} aria-hidden="true" /><div><h3>{title}</h3><p>{description}</p></div></div>)}</div>
      </div></div>
    </div>
    <div className="contact-premium-closing"><div className="contact-premium-closing-inner">{closingBenefits.map(({ title, description, icon: Icon }) => <div key={title}><Icon size={43} aria-hidden="true" /><div><h3>{title}</h3><p>{description}</p></div></div>)}</div></div>
  </section>;
}
