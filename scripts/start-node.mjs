import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const port=Number(process.env.PORT||3300),hostname=process.env.HOSTNAME||'127.0.0.1';
if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT inválido');
const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname',hostname,'--port',String(port)],{stdio:'inherit',windowsHide:true});
child.on('error',()=>{process.exitCode=1;});
child.on('exit',(code)=>{process.exitCode=code??1;});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{child.kill(signal);});
