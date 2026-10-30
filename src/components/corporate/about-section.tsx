import Image from "next/image";
import { ArrowRight, ChartNoAxesCombined, Handshake, HeartHandshake, Lightbulb, Settings2, ShieldCheck, Target, Trophy, UsersRound } from "@/components/corporate/icons";

const methodology = [
  { number: "01", title: "Escuchamos", description: "Comprendemos tu forma de trabajar.", icon: UsersRound },
  { number: "02", title: "Proponemos", description: "Elegimos un camino acorde a tus objetivos.", icon: Target },
  { number: "03", title: "Implementamos", description: "Damos forma a la solución contigo.", icon: Settings2 },
  { number: "04", title: "Acompañamos", description: "Te ayudamos a aprovechar la tecnología.", icon: ChartNoAxesCombined },
];
const communityValues = [
  { number: "01", title: "Apoyo a la comunidad", description: "Contribuimos al desarrollo de iniciativas que generan un impacto positivo en la región.", icon: Handshake },
  { number: "02", title: "Impulso al talento", description: "Respaldamos el esfuerzo de jóvenes, equipos y organizadores que hacen posible el deporte.", icon: UsersRound },
  { number: "03", title: "Oportunidades reales", description: "Creemos en espacios que fomentan la disciplina, el trabajo en equipo y el crecimiento.", icon: ChartNoAxesCombined },
  { number: "04", title: "Construyendo futuro", description: "El deporte también forma personas, comunidades más fuertes y mejores oportunidades.", icon: Trophy },
];

function FootballIcon() {
  return <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="m12 7 4.76 3.46-1.82 5.59H9.06l-1.82-5.59L12 7Z" fill="currentColor" fillOpacity=".16" /><path d="M12 2v5m9.51 1.91-4.75 1.55m1.12 9.63-2.94-4.04m-8.82 4.04 2.94-4.04m-6.57-7.14 4.75 1.55" /></svg>;
}

export function AboutSection() {
  return <>
    <section id="nosotros" className="premium-about section-anchor" aria-labelledby="about-title">
      <div className="identity-grid">
        <div className="identity-photo">
          <Image src="/images/nosotros/office-dusk.webp" fill sizes="(max-width: 1000px) 100vw, 52vw" alt="Oficina conceptual con escritorio, laptop y ventanales hacia una ciudad al atardecer" />
          <div className="identity-caption"><span className="identity-line" /><p>Ideas claras.<br /><em>Soluciones que conectan.</em></p><span>EL ENFOQUE TREVIX</span></div>
        </div>
        <div className="identity-copy">
          <p className="about-kicker">TECNOLOGÍA CON PROPÓSITO</p>
          <h2 id="about-title">Personas, ideas<br />y <em>mejores soluciones.</em></h2>
          <div className="identity-description"><p>En TREVIX ayudamos a negocios, organizaciones y emprendedores a transformar sus necesidades en soluciones tecnológicas útiles.</p><p>Escuchamos lo que necesitas, te orientamos con claridad y te acompañamos en la implementación. Nuestro enfoque combina atención personalizada, criterio técnico y compromiso con tu proyecto.</p></div>
          <div className="methodology-grid">{methodology.map(({ number, title, description, icon: Icon }) => <article className="methodology-card" key={number}><span className="about-card-number">{number}</span><Icon size={38} aria-hidden="true" /><div><h3>{title}</h3><p>{description}</p></div></article>)}</div>
          <div className="identity-action"><a href="#contacto" className="about-cta">Conversemos sobre tu próximo paso<ArrowRight size={21} aria-hidden="true" /></a><p className="identity-promise"><ShieldCheck size={34} aria-hidden="true" /><span>Tu proyecto,<br />nuestro compromiso.</span></p></div>
          <small className="identity-concept">Imagen conceptual; no representa instalaciones de TREVIX.</small>
        </div>
      </div>
    </section>
    <section id="deporte" className="premium-community section-anchor" aria-labelledby="sports-title">
      <div className="community-main">
        <div className="community-scene" aria-hidden="true"><Image src="/images/nosotros/football-dusk.webp" fill sizes="100vw" alt="" /></div>
        <div className="community-inner">
          <div className="community-copy"><p className="about-kicker"><span />COMPROMISO CON NUESTRA COMUNIDAD</p><h2 id="sports-title">Apoyamos<br /><em>el deporte.</em></h2><p className="community-description">Creemos en el talento, la disciplina y las oportunidades. Por eso, apoyamos iniciativas deportivas como el Mundialito La Bomba 2026, impulsando el desarrollo de nuestra comunidad.</p>
            <a className="community-tournament" href="/mundialito" aria-label="Conoce el Mundialito La Bomba 2026"><FootballIcon /><span><small>UNA MISMA PASIÓN</small><strong>Mundialito La Bomba 2026</strong></span><span className="tournament-arrow"><ArrowRight size={23} aria-hidden="true" /></span></a>
          </div>
          <div className="community-values">{communityValues.map(({ number, title, description, icon: Icon }) => <article className="community-card" key={number}><span className="about-card-number">{number}</span><Icon size={43} aria-hidden="true" /><div><h3>{title}</h3><p>{description}</p></div></article>)}</div>
          <p className="community-concept">Imagen deportiva conceptual.</p>
        </div>
      </div>
      <div className="community-closing"><div className="community-closing-inner"><div className="closing-message"><p className="about-kicker"><span />TECNOLOGÍA QUE TAMBIÉN IMPULSA SUEÑOS</p><p>El futuro también se construye <strong>en equipo.</strong></p></div><div className="closing-values"><div><Lightbulb size={36} aria-hidden="true" /><span>Más<br />oportunidades.</span></div><div><HeartHandshake size={39} aria-hidden="true" /><span>Comunidades<br />más fuertes.</span></div><div><Trophy size={37} aria-hidden="true" /><span>Un mejor<br />mañana.</span></div></div></div></div>
    </section>
  </>;
}
