"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Menu, X } from "@/components/corporate/icons";
import { navigation } from "@/lib/corporate/content";

function FootballIcon() {
  return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="m12 7 4.76 3.46-1.82 5.59H9.06l-1.82-5.59L12 7Z" fill="currentColor" fillOpacity=".17" /><path d="M12 2v5m9.51 1.91-4.75 1.55m1.12 9.63-2.94-4.04m-8.82 4.04 2.94-4.04m-6.57-7.14 4.75 1.55M6.12 3.91 8.2 4.6m9.68-.69-2.08.69m6.15 10.49-1.35 1.7M12 22l-1.32-1.71m-8.63-5.2 1.35-1.7" /></svg>;
}

export function Header({ mundialitoUrl }: { mundialitoUrl: string | null }) {
  const [active, setActive] = useState("inicio"), [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const close = () => { dialog.current?.close(); setOpen(false); };
  useEffect(() => {
    let frame = 0;
    const update = () => { frame = 0; let current = "inicio"; const marker = Math.min(innerHeight * .36, 300); for (const item of navigation) { const section = document.getElementById(item.id); if (section && section.getBoundingClientRect().top <= marker) current = item.id; } setActive(current); };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const onResize = () => { if (innerWidth > 1050) { dialog.current?.close(); setOpen(false); } schedule(); };
    window.addEventListener("scroll", schedule, { passive: true }); window.addEventListener("resize", onResize); update();
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", onResize); };
  }, []);
  useEffect(() => { if (!open) return; const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = previous; }; }, [open]);
  return <header className="site-header premium-header"><div className="header-inner">
    <a href="#inicio" className="brand" aria-label="TREVIX, inicio"><Image src="/brand/trevix-logo.png" width={1320} height={1191} sizes="80px" alt="TREVIX" priority /></a>
    <nav className="desktop-navigation" aria-label="Navegación principal">{navigation.map(item => <a key={item.id} href={`#${item.id}`} aria-current={active === item.id ? "location" : undefined} onClick={() => setActive(item.id)}>{item.label}</a>)}</nav>
    <div className="header-actions"><a className="tournament-link" href={mundialitoUrl ?? "/mundialito"}><FootballIcon /><span>Mundialito</span><ArrowRight size={19} aria-hidden="true" /></a>
      <button ref={trigger} type="button" className="menu-trigger" aria-label="Abrir menú" aria-controls="mobile-menu" aria-expanded={open} onClick={() => { if (!dialog.current?.open) { dialog.current?.showModal(); setOpen(true); } }}><Menu aria-hidden="true" /></button></div>
    <dialog id="mobile-menu" ref={dialog} className="mobile-menu" aria-label="Navegación móvil" onCancel={() => setOpen(false)} onClose={() => { setOpen(false); trigger.current?.focus(); }} onClick={event => { if (event.target === dialog.current) close(); }}>
      <div className="mobile-panel"><div className="mobile-top"><Image src="/brand/trevix-logo.png" width={48} height={44} alt="TREVIX" /><span>EXPLORA TREVIX</span><button type="button" aria-label="Cerrar menú" onClick={close}><X aria-hidden="true" /></button></div>
        <nav aria-label="Navegación móvil">{navigation.map((item, index) => <a key={item.id} href={`#${item.id}`} aria-current={active === item.id ? "location" : undefined} onClick={() => { setActive(item.id); close(); }}><span>0{index + 1}</span>{item.label}<ArrowUpRight size={20} aria-hidden="true" /></a>)}</nav>
        <a className="mobile-tournament" href={mundialitoUrl ?? "/mundialito"}><FootballIcon />Mundialito<ArrowRight size={19} aria-hidden="true" /></a>
        <p>Tecnología con propósito.<br />Soluciones para tu próximo paso.</p>
      </div>
    </dialog>
  </div></header>;
}
