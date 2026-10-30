"use client";
import { useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { services, solutions } from "@/lib/corporate/content";

const eventName = "trevix:service-interest";
function subscribe(update: () => void) {
  window.addEventListener(eventName, update);
  window.addEventListener("popstate", update);
  return () => { window.removeEventListener(eventName, update); window.removeEventListener("popstate", update); };
}
function selectedService() { return new URLSearchParams(window.location.search).get("servicio"); }

export function ServiceInquiryLink({ serviceId, title, children, linkLabel }: { serviceId: string; title: string; children: ReactNode; linkLabel?: string }) {
  function identifyService(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    // Replace only the query first. The native anchor then navigates within this
    // document, preserving keyboard/fragment behavior without a new contact flow.
    const url = new URL(window.location.href);
    url.searchParams.set("servicio", serviceId);
    window.history.replaceState(window.history.state, "", url);
    window.dispatchEvent(new Event(eventName));
  }
  return <a className="service-inquiry" href={`?servicio=${serviceId}#contacto`} aria-label={linkLabel ?? `Solicitar información: ${title}`} onClick={identifyService}>{children}</a>;
}

export function SelectedService() {
  const id = useSyncExternalStore(subscribe, selectedService, () => null);
  const service = services.find(item => item.id === id) ?? solutions.find(item => item.id === id);
  if (!service) return null;
  return <p className="service-interest" role="status"><span>PROYECTO DE INTERÉS</span><strong>{service.title}</strong></p>;
}
