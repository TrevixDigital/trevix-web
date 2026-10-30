import Link from "next/link";
import { getImageProps } from "next/image";
import { ArrowRight, MapPin, Trophy, CircleDot } from "lucide-react";
import { assetPath, site } from "@/lib/mundialito/site";

export function Hero({
  compact = false,
  title,
}: {
  compact?: boolean;
  title?: string;
}) {
  const common = {
    alt: "",
    sizes: "100vw",
    loading: "eager" as const,
    fetchPriority: "high" as const,
    className: "hero-image",
  };
  const { props: desktop } = getImageProps({
    ...common,
    src: assetPath(site.heroImage),
    width: 2020,
    height: 778,
  });
  const { props: mobile } = getImageProps({
    ...common,
    src: assetPath(site.heroMobileImage),
    width: 1000,
    height: 1500,
  });
  const words = title?.split(" ");
  return (
    <>
      <section
        className={`hero ${compact ? "hero-compact" : ""}`}
        aria-labelledby="hero-title"
      >
        <div className="hero-art" aria-hidden="true">
          <picture>
            <source
              media="(max-width: 760px)"
              srcSet={mobile.srcSet}
              sizes="100vw"
            />
            {/* getImageProps supplies optimized responsive sources for art direction. */}
            <img {...desktop} alt="" />
          </picture>
        </div>
        <div className="shell hero-content">
          <p className="eyebrow">
            <span className="gold-line" />
            {title
              ? "MUNDIALITO LA BOMBA 2026"
              : "LA BOMBA · PETÉN · GUATEMALA"}
          </p>
          <h1
            id="hero-title"
            className={
              title
                ? `section-hero-title ${title.length > 14 ? "hero-title-long" : "hero-title-short"}`
                : "tournament-title"
            }
          >
            {words ? (
              <>
                {words.length > 1 && (
                  <span className="title-overline">
                    {words.slice(0, -1).join(" ")}
                  </span>
                )}
                <span className="title-gold">{words.at(-1)}</span>
              </>
            ) : (
              <>
                <span className="title-overline">MUNDIALITO</span>
                <span className="title-gold">LA BOMBA</span>
                <em>2026</em>
              </>
            )}
          </h1>
          <p className="hero-motto">
            FÚTBOL <span>·</span> AMISTAD <span>·</span> PASIÓN
          </p>
          {!compact && (
            <>
              <p className="hero-description">
                Más que fútbol.
                <br />
                <strong>Es nuestra pasión.</strong>
              </p>
              <div className="hero-actions">
                <Link href="/mundialito/partidos" className="button button-gold">
                  <CircleDot size={20} /> Ver partidos <ArrowRight size={18} />
                </Link>
                <Link href="/mundialito/grupos" className="button button-outline">
                  <Trophy size={20} /> Ver grupos
                </Link>
              </div>
            </>
          )}
          <p className="hero-location">
            <MapPin size={14} /> {site.location}
          </p>
        </div>
        <div className="hero-side">
          <span>6 GRUPOS</span>
          <span>18 EQUIPOS</span>
          <strong>
            UNA MISMA
            <br />
            PASIÓN.
          </strong>
        </div>
      </section>
    </>
  );
}
