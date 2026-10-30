import Image from "next/image";
import { ArrowRight, Check, Grid2X2, Layers3, ShieldCheck, Wrench } from "@/components/corporate/icons";
import { solutions } from "@/lib/corporate/content";
import { ServiceInquiryLink } from "@/components/corporate/service-interest";
import { CorporateBenefits } from "@/components/corporate/corporate-benefits";

const icons = [Grid2X2, ShieldCheck, Layers3, Wrench];

export function SolutionsSection() {
  return <section id="soluciones" className="premium-solutions section-anchor" aria-labelledby="solutions-title">
    <div className="solutions-office" aria-hidden="true"><Image src="/images/soluciones/office-panorama.webp" fill sizes="(max-width:900px) 100vw, 1400px" alt="" /><Image className="solutions-office-logo" src="/brand/trevix-logo.png" width={1320} height={1191} sizes="110px" alt="" /></div>
    <div className="solutions-shell">
      <header className="solutions-heading" data-reveal>
        <div className="solutions-heading-copy"><p className="eyebrow"><span />SOLUCIONES TECNOLÓGICAS</p><h2 id="solutions-title">La tecnología adecuada.<br /><em>El respaldo que necesitas.</em></h2><p className="solutions-description">Te orientamos en la elección, instalación y configuración de software y equipos, con asistencia adaptada a tu forma de trabajar.</p></div>
        <p className="solutions-promise">Soluciones confiables <br />para un trabajo más eficiente.</p>
      </header>
      <div className="solution-grid">
        {solutions.map((solution, index) => {
          const Icon = icons[index], number = String(index + 1).padStart(2, "0");
          return <article className="solution-card" key={solution.id} aria-labelledby={`solution-${solution.id}`} data-reveal>
            <div className="solution-photo"><Image src={`/images/soluciones/${solution.image}.webp`} width={1000} height={625} sizes="(max-width:639px) 100vw, (max-width:1279px) 50vw, 25vw" alt="" /><span className="solution-number" aria-label={`Solución ${number}`}>{number}</span></div>
            <div className="solution-body"><span className="solution-icon"><Icon size={29} strokeWidth={1.65} aria-hidden="true" /></span><p className="solution-category">{solution.category}</p><h3 id={`solution-${solution.id}`}>{solution.title}</h3><p className="solution-description">{solution.note}</p><ul>{solution.items.map(item => <li key={item}><span className="solution-check"><Check size={12} strokeWidth={2.7} aria-hidden="true" /></span>{item}</li>)}</ul></div>
            <ServiceInquiryLink serviceId={solution.id} title={solution.title} linkLabel={`Conoce más sobre ${solution.title}`}>Conoce más<span className="solution-arrow"><ArrowRight size={22} strokeWidth={1.8} aria-hidden="true" /></span></ServiceInquiryLink>
          </article>;
        })}
      </div>
      <p className="trademark-note">Las marcas mencionadas pertenecen a sus respectivos titulares. La asistencia descrita no implica una asociación, certificación ni representación oficial de sus fabricantes.</p>
      <CorporateBenefits />
    </div>
  </section>;
}
