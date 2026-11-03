import { spawn } from 'node:child_process';
import { mkdir,writeFile,readFile,access } from 'node:fs/promises';
import { resolve,sep } from 'node:path';
import { createHash } from 'node:crypto';
export async function runStudio(dir:string,manifest:Record<string,unknown>){
 const root=resolve(process.env.WORK_DIR||'work');dir=resolve(dir);if(!dir.startsWith(root+sep))throw new Error('Studio outside work root');
 await mkdir(dir,{recursive:true});await writeFile(resolve(dir,'manifest.json'),JSON.stringify({...manifest,workRoot:root}));
 await new Promise<void>((ok,no)=>{const child=spawn('python3',[resolve('worker/studio/render.py'),resolve(dir,'manifest.json')],{stdio:['ignore','ignore','pipe']});child.stderr.on('data',()=>{});child.on('error',()=>no(new Error('STUDIO_EXECUTION_FAILED')));child.on('close',code=>code===0?ok():no(new Error('STUDIO_RENDER_FAILED')));});
 const path=resolve(dir,'video.mp4');await access(path);return {path,sha256:createHash('sha256').update(await readFile(path)).digest('hex'),verification:JSON.parse(await readFile(resolve(dir,'verification.json'),'utf8'))};
}
