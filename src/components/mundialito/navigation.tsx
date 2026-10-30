"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Menu,
  X,
  House,
  UsersRound,
  CircleDot,
  GitBranch,
  Trophy,
  List,
  ChartNoAxesColumnIncreasing,
} from "lucide-react";
import { assetPath } from "@/lib/mundialito/site";
import { isNavigationActive, navigationLinks } from "@/lib/mundialito/navigation";
const icons = [
  House,
  UsersRound,
  CircleDot,
  GitBranch,
  Trophy,
  List,
  ChartNoAxesColumnIncreasing,
];
export function Navigation() {
  const pathname = usePathname();
  // The persistent App Router layout otherwise keeps the native modal and its
  // top-layer backdrop alive across history/programmatic route transitions.
  return <NavigationMenu key={pathname} pathname={pathname}/>;
}
function NavigationMenu({pathname}:{pathname:string}) {
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => {
    if (dialog.current?.open) dialog.current.close();
    setOpen(false);
    trigger.current?.focus();
  };
  const toggle = () => {
    const menu = dialog.current;
    if (!menu?.isConnected) return;
    if (menu.open) {
      close();
      return;
    }
    menu.showModal();
    setOpen(menu.open);
  };
  useEffect(() => {
    const menu = dialog.current;
    // Close only the departing route's dialog. An open-state cleanup can run
    // after a rapid reopen and otherwise close the newly opened modal.
    return () => { if (menu?.open) menu.close(); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const menu=dialog.current;
    document.body.style.overflow = "hidden";
    const media = window.matchMedia("(min-width: 1081px)");
    const resize = () => {
      if (media.matches) {
        dialog.current?.close();
        setOpen(false);
      }
    };
    media.addEventListener("change", resize);
    const hide=()=>{
      if(menu?.open)menu.close();
      setOpen(false);
      document.body.style.overflow=previous;
    };
    window.addEventListener("pagehide",hide);
    return () => {
      document.body.style.overflow = previous;
      media.removeEventListener("change", resize);
      window.removeEventListener("pagehide",hide);
    };
  }, [open]);
  const links = navigationLinks.map(({ href, label }, index) => {
    const Icon = icons[index];
    return (
      <Link
        key={href}
        href={href}
        aria-current={isNavigationActive(pathname, href) ? "page" : undefined}
        onClick={() => {
          if (dialog.current?.open) close();
        }}
      >
        <Icon size={18} aria-hidden="true" />
        {label}
      </Link>
    );
  });
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link
          href="/mundialito"
          className="brand"
          aria-label="Mundialito La Bomba 2026, inicio"
        >
          <Image
            src={assetPath("/images/logo-transparent.png")}
            width={80}
            height={80}
            alt="Logo oficial del Mundialito La Bomba"
            priority
          />
          <span>
            MUNDIALITO
            <strong>
              LA BOMBA <small>2026</small>
            </strong>
          </span>
        </Link>
        <nav
          className="main-nav desktop-navigation"
          aria-label="Navegación principal"
        >
          {links}
        </nav>
        <button
          ref={trigger}
          type="button"
          className="menu-toggle"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          aria-haspopup="dialog"
          onClick={toggle}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
        <dialog
          ref={dialog}
          id="mobile-navigation"
          className="mobile-menu"
          aria-labelledby="mobile-menu-title"
          onCancel={(event) => {
            // Native Escape / platform dismissal follows the same state cleanup.
            event.preventDefault();
            close();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            const items = Array.from(
              dialog.current?.querySelectorAll<HTMLElement>(
                "button:not([disabled]), a[href]",
              ) ?? [],
            );
            const first = items[0],
              last = items.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }}
          onClose={() => {
            // A queued close event must not reset a menu that has reopened.
            if (dialog.current?.open) return;
            setOpen(false);
            trigger.current?.focus();
          }}
          onClick={(event) => {
            if (event.target === dialog.current) close();
          }}
        >
          <div className="mobile-menu-heading">
            <div>
              <p className="eyebrow">MUNDIALITO LA BOMBA 2026</p>
              <h2 id="mobile-menu-title">El torneo</h2>
            </div>
            <button
              type="button"
              aria-label="Cerrar menú"
              onClick={close}
              autoFocus
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <nav aria-label="Navegación móvil">{links}</nav>
          <p className="mobile-menu-footer">Fútbol · Amistad · Pasión</p>
        </dialog>
      </div>
    </header>
  );
}
