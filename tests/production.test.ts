import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateAvatarUsd,assertProductionBudget,assertNationalCoverage } from '../worker/production-policy';
import { paidOnce } from '../worker/avatar-production';
import { spawnSync } from 'node:child_process';
import { mkdtemp,writeFile,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
test('full episode budget rejects current small balance before any generation',()=>{
 assert.equal(estimateAvatarUsd(420),16.17);assert.equal(estimateAvatarUsd(480),18.48);
 assert.throws(()=>assertProductionBudget(480,9.1,20));assert.throws(()=>assertProductionBudget(480,100,18));assert.throws(()=>assertProductionBudget(480,null,20));assert.equal(assertProductionBudget(480,20,20),18.48);
});
test('national selection requires majority Brazil and distinct local coverage',()=>{
 assert.throws(()=>assertNationalCoverage([{scope:'BR',macroregion:'SE',city:'Osasco'},{scope:'BR',macroregion:'SE',city:'Osasco'},{scope:'WORLD'}]));
 assertNationalCoverage([{scope:'BR',macroregion:'N',city:'Belém'},{scope:'BR',macroregion:'NE',city:'Recife'},{scope:'BR',macroregion:'S',city:'Curitiba'},{scope:'WORLD'}]);
});
test('uncertain paid write stops; completed stage is reused without charging again',async()=>{
 let started=false,complete=false,calls=0;let data:any;
 const store={read:async()=>({started,complete,data}),start:async()=>{started=true;},complete:async(d:any)=>{data=d;complete=true;}};
 await assert.rejects(paidOnce(store,async()=>{calls++;throw new Error('connection lost after submit');}));
 await assert.rejects(paidOnce(store,async()=>{calls++;return 'duplicate';}));assert.equal(calls,1);
 data='confirmed-provider-id';complete=true;assert.equal(await paidOnce(store,async()=>{calls++;return 'duplicate';}),'confirmed-provider-id');assert.equal(calls,1);
});
test('real studio encode preserves image text, hides ticker during its cutaway and keeps speech duration',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'aindabem-studio-'));
 const exec=(cmd:string,args:string[])=>{const r=spawnSync(cmd,args,{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;};
 try{
  const video=resolve(dir,'source.mp4'),audio=resolve(dir,'master.wav'),image=resolve(dir,'source.png');
  exec('ffmpeg',['-v','error','-f','lavfi','-i','color=c=teal:s=1280x720:r=25:d=3','-c:v','libx264','-pix_fmt','yuv420p',video]);
  exec('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=3','-ac','1','-c:a','pcm_s16le',audio]);
  exec('python3',['-c',"from PIL import Image,ImageDraw; import sys; im=Image.new('RGB',(600,200),'white'); ImageDraw.Draw(im).text((30,30),'ORIGINAL IMAGE TITLE',fill='black'); im.save(sys.argv[1])",image]);
  const sha256=createHash('sha256').update(await readFile(image)).digest('hex');
  await writeFile(resolve(dir,'manifest.json'),JSON.stringify({workRoot:dir,video,audio,durations:[3],alignment:[{transcript:'Começa imagem aqui fim.',words:[{word:'Começa',start:0,end:.5},{word:'imagem',start:1,end:1.2},{word:'aqui',start:1.3,end:1.8},{word:'fim',start:2.1,end:2.5}]}],ticker:['Extra headline'],inserts:[{scene:0,startPhrase:'imagem',endPhrase:'fim',kind:'image',path:image,sha256,hasEmbeddedText:true,credit:'Fixture'}]}));
  exec('python3',['worker/studio/render.py',resolve(dir,'manifest.json')]);
  const info=JSON.parse(await readFile(resolve(dir,'verification.json'),'utf8'));assert.equal(info.durationSeconds,3);assert.equal(info.naturalPlaybackRate,1);
  const r=spawnSync('ffmpeg',['-v','error','-ss','1.5','-i',resolve(dir,'video.mp4'),'-frames:v','1','-vf','format=rgb24,crop=1:1:20:690','-f','rawvideo','-']);assert.equal(r.status,0);assert.ok(r.stdout[0]>240&&r.stdout[1]>235&&r.stdout[2]>215,'ticker must not cover the image cutaway');
 }finally{await rm(dir,{recursive:true,force:true});}
});
