"use client";
import { useEffect } from "react";
/** Content stays visible with no JS, reduced motion or an unavailable observer. */
export function Reveal() {
  useEffect(()=>{
    if(matchMedia("(prefers-reduced-motion: reduce)").matches || !('IntersectionObserver' in window))return;
    const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.remove('reveal-wait');observer.unobserve(e.target);}}),{threshold:.08});
    const elements=Array.from(document.querySelectorAll('[data-reveal]')).filter(e=>e.getBoundingClientRect().top>innerHeight);
    elements.forEach(e=>{e.classList.add('reveal-wait');observer.observe(e);});
    return()=>{observer.disconnect();elements.forEach(e=>e.classList.remove('reveal-wait'));};
  },[]);
  return null;
}
