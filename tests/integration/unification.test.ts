import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { NextResponse, NextRequest } from "next/server.js";
import { privateDirectory } from "../../src/lib/mundialito/players/private-storage.ts";
import { isPublicAdminPath, isSameRequestOrigin, adminCookieOptions } from "../../src/lib/mundialito/admin/access.ts";

const require = createRequire(import.meta.url);
function compile(file: string, overrides: Record<string,unknown>) {
  const exports:Record<string,unknown> = {};
  const source=fs.readFileSync(new URL(file,import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  runInNewContext(code,{exports,process,URL,FormData,Response,Buffer,require:(id:string)=>overrides[id]??require(id)});
  return exports;
}
test("integración: cookie real del cliente administrativo conserva /mundialito/admin sin basePath global",()=>{
  assert.equal(adminCookieOptions(true,"/mundialito").path,"/mundialito/admin");
  for(const file of ['client.ts','server.ts']) { const source=fs.readFileSync(new URL('../../src/lib/mundialito/admin/'+file,import.meta.url),'utf8');assert.doesNotMatch(source,/NEXT_PUBLIC_BASE_PATH/);assert.match(source,/"\/mundialito"/); }
});
test("integración: POST logout conserva CSRF, limpia cookies y redirige bajo /mundialito",async()=>{
  let cleared=0,signouts=0;
  const compiled=compile('../../src/app/(torneo)/mundialito/admin/logout/route.ts',{'@/lib/mundialito/admin/server':{clearAdminCookies:async()=>{cleared++;},serverAdminClient:async()=>({auth:{signOut:async({scope}:{scope:string})=>{assert.equal(scope,'local');signouts++;return {error:null};}}})},'@/lib/mundialito/admin/access':{isSameRequestOrigin}});
  const post=compiled.POST as (r:NextRequest)=>Promise<Response>;
  for(const origin of [undefined,'https://evil.example']) { const response=await post(new NextRequest('https://trevix.test/mundialito/admin/logout',{method:'POST',headers:{host:'trevix.test',...(origin?{origin}:{})}}));assert.equal(response.status,403); }
  assert.equal(cleared,0);assert.equal(signouts,0);
  const response=await post(new NextRequest('https://trevix.test/mundialito/admin/logout',{method:'POST',headers:{host:'trevix.test',origin:'https://trevix.test'}}));assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/mundialito/admin/login?estado=salida');assert.equal(cleared,1);assert.equal(signouts,1);assert.match(response.headers.get('cache-control')!,/no-store/);
});
test("integración: acción login valida Auth y permiso antes de redirigir, sin red real",async()=>{
  let permission='allowed',cleared=0,signedOut=0;
  const form=new FormData();form.set('email','admin@example.test');form.set('password','mock-only-password');
  const client={auth:{signInWithPassword:async()=>({error:null}),signOut:async()=>{signedOut++;}}};
  const compiled=compile('../../src/app/(torneo)/mundialito/admin/actions.ts',{'next/navigation':{redirect:(url:string)=>{throw Error('REDIRECT:'+url);}},'@/lib/mundialito/admin/server':{serverAdminClient:async()=>client,clearAdminCookies:async()=>{cleared++;}},'@/lib/mundialito/admin/client':{verifyAdmin:async()=>permission}});
  const login=compiled.signInAdmin as (state:{error:string},f:FormData)=>Promise<{error:string}>;
  assert.ok((await login({error:''},new FormData())).error);
  permission='denied';assert.match((await login({error:''},form)).error,/autorización/);assert.equal(cleared,1);assert.equal(signedOut,1);
  permission='allowed';await assert.rejects(login({error:''},form),/REDIRECT:\/mundialito\/admin/);
});
test("integración: almacenamiento privado rechaza rutas relativas y directorios del proyecto",()=>{
  assert.throws(()=>privateDirectory(undefined,'TEST'));
  assert.throws(()=>privateDirectory('relative/path','TEST'));
  assert.throws(()=>privateDirectory(path.join(process.cwd(),'public','private'),'TEST'));
  assert.throws(()=>privateDirectory(path.dirname(process.cwd()),'TEST'));
});
test("integración: persistencia y bloqueo del importador se prueban solo con archivos temporales",async(t)=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'trevix-import-test-'));
  const before=process.env.OFFICIAL_IMPORT_RUNS_DIR;process.env.OFFICIAL_IMPORT_RUNS_DIR=temp;
  t.after(()=>{if(before===undefined)delete process.env.OFFICIAL_IMPORT_RUNS_DIR;else process.env.OFFICIAL_IMPORT_RUNS_DIR=before;fs.rmSync(temp,{recursive:true,force:true});});
  const compiled=compile('../../src/lib/mundialito/players/official-import-server.ts',{'server-only':{},'./private-storage':{privateDirectory},'./import-preview':{},'./model':{isUuid:(s:string)=>/^[0-9a-f-]{36}$/.test(s),RosterError:Error},'./official-import':{verifyImportAdmin:async()=> 'test-owner',OFFICIAL_FILES:[]}});
  const persist=compiled.persistOfficialRun as (run:unknown,initial?:boolean)=>Promise<void>,load=compiled.loadOfficialRun as (client:unknown,id:string)=>Promise<{cursor:number}>,lock=compiled.withOfficialLock as (fn:()=>Promise<unknown>)=>Promise<unknown>;
  const run={id:'00000000-0000-4000-8000-000000000999',version:1,owner:'test-owner',cursor:0};await persist(run,true);assert.equal((await load({},run.id)).cursor,0);await persist({...run,cursor:1});assert.equal((await load({},run.id)).cursor,1);await assert.rejects(persist(run,true));
  await lock(async()=>{await assert.rejects(lock(async()=>null));});assert.equal(fs.existsSync(path.join(temp,'official-import.lock')),false);
});

test("integración: proxy real protege solo el administrador y falla cerrado",async()=>{
 let access='anonymous',created=0;
 const compiled=compile('../../src/proxy.ts',{'next/server.js':{NextResponse},'./lib/mundialito/admin/access.ts':{isPublicAdminPath},'./lib/mundialito/admin/client.ts':{adminConfiguration:()=>({}),createAdminClient:()=>{created++;return {auth:{getUser:async()=>({})}};},verifyAdmin:async()=>access}});
 const proxy=compiled.proxy as (r:NextRequest)=>Promise<Response>;
 const request=(route:string)=>new NextRequest('https://trevix.test'+route);
 for(const route of ['/','/mundialito','/mundialito/grupos'])assert.equal((await proxy(request(route))).headers.get('x-middleware-next'),'1');
 assert.equal(created,0);
 for(const route of ['/mundialito/admin','/mundialito/admin/jugadores/importar','/mundialito/admin/partidos/test/editar']) {const r=await proxy(request(route));assert.equal(r.status,307);assert.equal(r.headers.get('location'),'https://trevix.test/mundialito/admin/login');assert.match(r.headers.get('cache-control')!,/no-store/);}
 access='denied';let r=await proxy(request('/mundialito/admin'));assert.equal(r.status,403);assert.match(await r.text(),/action="\/mundialito\/admin\/logout"/);
 access='unavailable';assert.equal((await proxy(request('/mundialito/admin'))).status,503);
 access='allowed';r=await proxy(request('/mundialito/admin'));assert.equal(r.headers.get('x-middleware-next'),'1');assert.match(r.headers.get('content-security-policy')!,/frame-ancestors 'none'/);
 assert.equal((await proxy(request('/mundialito/admin/login'))).headers.get('x-middleware-next'),'1');
 assert.equal((await proxy(request('/mundialito/admin/logout'))).headers.get('x-middleware-next'),'1');
});
