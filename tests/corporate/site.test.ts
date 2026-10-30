import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { readSiteConfig, safeHttps, whatsappHref } from "../../src/lib/corporate/config.ts";
import * as content from "../../src/lib/corporate/content.ts";
import * as config from "../../src/lib/corporate/config.ts";

test("configuración vacía: no inventa teléfono, correo ; torneo integrado",()=>{const c=readSiteConfig({});assert.equal(c.email,null);assert.equal(c.whatsapp,null);assert.equal(c.mundialitoUrl,"/mundialito");assert.equal(whatsappHref(c.whatsapp),null);});
test("URLs externas: solo HTTPS y sin credenciales; entradas peligrosas se rechazan",()=>{for(const u of ["javascript:alert(1)","http://example.test","https://user:password@example.test","file:///C:/test","no es url"])assert.equal(safeHttps(u),null);assert.equal(safeHttps("https://example.test/torneo"),"https://example.test/torneo");});
test("WhatsApp: número internacional y mensaje codificado; sin datos no hay enlace",()=>{const c=readSiteConfig({TREVIX_WHATSAPP:"+50255551234"});assert.equal(c.whatsapp,"50255551234");assert.equal(whatsappHref(c.whatsapp,"Hola, asesoría & web"),"https://wa.me/50255551234?text=Hola%2C%20asesor%C3%ADa%20%26%20web");for(const phone of ["502 5555 1234","javascript:12345678","123","<script>"])assert.equal(readSiteConfig({TREVIX_WHATSAPP:phone}).whatsapp,null);});
test("correo: rechaza inyección y conserva la dirección configurada",()=>{assert.equal(readSiteConfig({TREVIX_EMAIL:"equipo@example.test"}).email,"equipo@example.test");for(const email of ["hola","a@example.test\r\nBcc:a@b.test","<a>@example.test","a%0ab@example.test"])assert.equal(readSiteConfig({TREVIX_EMAIL:email}).email,null);});
test("contenido: cuatro servicios, cinco anclas, cuatro soluciones y todas las versiones solicitadas",()=>{assert.equal(content.services.length,4);assert.equal(content.navigation.length,5);assert.equal(content.solutions.length,4);assert.equal(new Set(content.navigation.map(n=>n.id)).size,5);for(const name of ["Microsoft Office 2019","Microsoft Office 2021","Microsoft Office 2024","Microsoft 365"])assert.ok(content.solutions[0].items.includes(name as never));});

function render(env:Record<string,string>={}) {
  const require=createRequire(import.meta.url);
  function compile(file:string,overrides:Record<string,unknown>={}) {
    const exports:Record<string,unknown>={};const code=ts.transpileModule(fs.readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
    runInNewContext(code,{exports,process:{env},URL,Intl,Date,require:(id:string)=>overrides[id]??(id === "@/components/corporate/icons" ? compile("../../src/components/corporate/icons.tsx") : require(id))});return exports;
  }
  const interest=compile('../../src/components/corporate/service-interest.tsx',{'@/lib/corporate/content':content});
  const contactSection=compile('../../src/components/corporate/contact-section.tsx',{'@/components/corporate/service-interest':interest});
  const benefits=compile('../../src/components/corporate/corporate-benefits.tsx');
  const solutionsSection=compile('../../src/components/corporate/solutions-section.tsx',{'@/lib/corporate/content':content,'@/components/corporate/service-interest':interest,'@/components/corporate/corporate-benefits':benefits});
  const servicesSection=compile('../../src/components/corporate/services-section.tsx',{'@/lib/corporate/content':content,'@/components/corporate/service-interest':interest});
  const aboutSection=compile('../../src/components/corporate/about-section.tsx');
  const hero=compile('../../src/components/corporate/home-hero.tsx');
  const header=compile('../../src/components/corporate/header.tsx',{'@/lib/corporate/content':content});
  const page=compile('../../src/app/(corporativo)/page.tsx',{'@/components/corporate/contact-section':contactSection,'@/components/corporate/about-section':aboutSection,'@/components/corporate/solutions-section':solutionsSection,'@/components/corporate/service-interest':interest,'@/components/corporate/services-section':servicesSection,'@/components/corporate/home-hero':hero,'@/components/corporate/header':header,'@/components/corporate/reveal':{Reveal:()=>null},'@/lib/corporate/content':content,'@/lib/corporate/config':config});
  return renderToStaticMarkup(React.createElement(page.default as React.ComponentType));
}
test("página real: secciones y solicitudes funcionan con anclas, sin formulario ficticio ni precios",()=>{const html=render();for(const n of content.navigation)assert.ok(html.includes(`id="${n.id}"`));assert.match(html,/id="deporte"/);assert.match(html,/href="\/mundialito"/);assert.doesNotMatch(html,/<form|mailto:|Supabase|distribuidor autorizado|clientes satisfechos|\+100/);assert.equal((html.match(/class="service-card"/g)??[]).length,4);assert.match(html,/no representa instalaciones de TREVIX/);assert.match(html,/aria-controls="mobile-menu" aria-expanded="false"/);});
test("contacto oficial: WhatsApp confirmado como único canal, sin mensajes pendientes ni correo aunque exista configuración anterior",()=>{const html=render({TREVIX_WHATSAPP:"+50255551234",TREVIX_EMAIL:"equipo@example.test"});assert.match(html,/href="https:\/\/wa.me\/50240218091" target="_blank" rel="noopener noreferrer"/);assert.match(html,/\+502 4021 8091/);assert.match(html,/Atención disponible 24\/7/);assert.match(html,/asistida por chatbot/);assert.doesNotMatch(html,/50255551234|mailto:|equipo@example.test|Número oficial por confirmar|Pronto estaremos en contacto|Canal en preparación|persona a persona|preparando nuestros canales/i);assert.match(html,/href="\/mundialito"/);});
