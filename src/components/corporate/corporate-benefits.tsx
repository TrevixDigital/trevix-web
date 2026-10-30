import { Headphones, Settings2, ShieldCheck, UsersRound } from "@/components/corporate/icons";

const benefits = [
  { icon: Settings2, title: "Soluciones personalizadas", text: "Adaptadas a tus necesidades." },
  { icon: ShieldCheck, title: "Tecnología segura y confiable", text: "Para un mejor rendimiento." },
  { icon: Headphones, title: "Soporte continuo", text: "Antes, durante y después." },
  { icon: UsersRound, title: "Acompañamiento en cada proyecto", text: "Tu crecimiento es nuestro objetivo." },
];

export function CorporateBenefits() {
  return <div className="corporate-benefits" aria-label="Nuestro compromiso con tus soluciones" data-reveal>
    {benefits.map(({ icon: Icon, title, text }) => <div key={title}><Icon size={47} strokeWidth={1.7} aria-hidden="true" /><p><strong>{title}</strong><span>{text}</span></p></div>)}
  </div>;
}
