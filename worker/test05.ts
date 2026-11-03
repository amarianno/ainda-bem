import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pool } from '../lib/db';
import { synthesize,speechRequest } from './voice';
import { HeygenClient,HeygenError,assertPilotBudget,billingSnapshot } from './heygen';
import script from './test05-script.json';
const key='ainda-bem-05-approved-v1';
const avatar='089168db17264c6b91c84d08ade8e559';
async function audit(stage:string,data:object={}){await pool.query('INSERT INTO audit_events(event_type,details) VALUES($1,$2)',['TEST05_'+stage,JSON.stringify({key,...data})]);}
function ff(args:string[]){const r=spawnSync('ffmpeg',['-nostdin','-y','-v','error',...args],{stdio:'ignore'});if(r.status!==0)throw new Error('FFMPEG_FAILED');}
function duration(path:string){const r=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','json',path],{encoding:'utf8'});if(r.status!==0)throw new Error('FFPROBE_FAILED');const v=Number(JSON.parse(r.stdout).format.duration);if(!Number.isFinite(v)||v<=0)throw new Error('DURATION_INVALID');return v;}
export async function tickTest05(){
 if(process.env.TEST05_KEY!==key||!process.env.OPENAI_API_KEY||!process.env.HEYGEN_API_KEY)return;
 const c=await pool.connect();
 try{
  if(!(await c.query('SELECT pg_try_advisory_lock(hashtext($1)) AS held',[key])).rows[0].held)return;
  const rows=(await c.query("SELECT event_type,details FROM audit_events WHERE details->>'key'=$1 AND event_type LIKE 'TEST05_%' ORDER BY created_at",[key])).rows;
  const event=(name:string,scene?:number)=>rows.find(e=>e.event_type==='TEST05_'+name&&(scene===undefined||e.details.scene===scene))?.details;
  if(event('FAILED')||event('COMPLETED'))return;
  const api=new HeygenClient(process.env.HEYGEN_API_KEY);
  if(!event('STARTED')){
   if(Date.now()>Date.parse('2026-11-09T03:00:00Z'))throw new Error('EDITORIAL_DEADLINE_PASSED');
   const user=await api.call('/v3/users/me');if(user.username!=='83e87bbf2f87443b8db3c699b3aedeba')throw new Error('ACCOUNT_MISMATCH');
   const before=assertPilotBudget(user,8);const look=await api.call('/v3/avatars/looks/'+avatar);const data=look.avatar_item??look;
   if(data.supported_api_engines&&!data.supported_api_engines.includes('avatar_iv'))throw new Error('ENGINE_UNAVAILABLE');
   await audit('STARTED',{billingBefore:before,avatar,engine:'avatar_iv',voice:'marin',scriptHash:createHash('sha256').update(JSON.stringify(script)).digest('hex'),approvedScript:true});return;
  }
  const dir=resolve(process.env.WORK_DIR||'work','test05');await mkdir(dir,{recursive:true});
  for(let scene=0;scene<script.scenes.length;scene++){
   const mp3=resolve(dir,scene+'.mp3'),wav=resolve(dir,scene+'.wav');
   if(!event('AUDIO_READY',scene)){
    if(event('AUDIO_STARTED',scene))return; // uncertain paid request: never repeat automatically
    await audit('AUDIO_STARTED',{scene});const bytes=await synthesize(script.scenes[scene].narration,'marin');await writeFile(mp3,bytes);
    ff(['-i',mp3,'-ar','48000','-ac','1','-c:a','pcm_s16le',wav]);const seconds=duration(wav);if(seconds>100)throw new Error('SCENE_TOO_LONG');
    const config=speechRequest('','marin');await audit('AUDIO_READY',{scene,duration:seconds,voice:'marin',model:config.model,speed:config.speed,audioBase64:bytes.toString('base64')});return;
   }
   if(!event('ALIGNMENT_READY',scene)){
    if(event('ALIGNMENT_STARTED',scene))return;
    await audit('ALIGNMENT_STARTED',{scene});const form=new FormData();form.append('file',new Blob([await readFile(wav)],{type:'audio/wav'}),scene+'.wav');form.append('model','whisper-1');form.append('language','pt');form.append('response_format','verbose_json');form.append('timestamp_granularities[]','word');form.append('timestamp_granularities[]','segment');
    const r=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY},body:form,signal:AbortSignal.timeout(120000)});if(!r.ok)throw new Error('ASR_HTTP_'+r.status);const data=await r.json();if(!data.words?.length)throw new Error('ASR_NO_WORDS');
    await audit('ALIGNMENT_READY',{scene,transcript:data.text,words:data.words,segments:data.segments,usage:data.usage??null});return;
   }
  }
  if(!event('MASTER_READY')){
   await writeFile(resolve(dir,'concat.txt'),script.scenes.map((_,i)=>`file '${i}.wav'`).join('\n'));
   ff(['-f','concat','-safe','0','-i',resolve(dir,'concat.txt'),'-c:a','copy',resolve(dir,'master.wav')]);const seconds=duration(resolve(dir,'master.wav'));if(seconds>180)throw new Error('MASTER_TOO_LONG');
   await audit('MASTER_READY',{duration:seconds,sceneDurations:script.scenes.map((_,i)=>event('AUDIO_READY',i).duration)});return;
  }
  if(process.env.TEST05_RENDER!=='approved')return; // internal editorial verification before the avatar charge
  if(!event('ASSET_READY')){
   if(event('ASSET_STARTED'))return;
   await audit('ASSET_STARTED');const asset=await api.uploadAudio(await readFile(resolve(dir,'master.wav')));if(typeof asset.asset_id!=='string')throw new Error('ASSET_RESPONSE_INVALID');
   await audit('ASSET_READY',{assetId:asset.asset_id,audioUrl:asset.url});return;
  }
  if(!event('VIDEO_CREATED')){
   if(event('VIDEO_SUBMITTING'))return;
   const user=await api.call('/v3/users/me');if(user.username!=='83e87bbf2f87443b8db3c699b3aedeba')throw new Error('ACCOUNT_MISMATCH');assertPilotBudget(user,8);
   const request={type:'avatar',avatar_id:avatar,audio_asset_id:event('ASSET_READY').assetId,engine:{type:'avatar_iv'},expressiveness:'medium',aspect_ratio:'16:9',resolution:'720p',title:'Ainda Bem! • teste 05 privado • Osasco e Barbados • sintético',motion_prompt:'Preserve the approved fictional Clara exactly: same face, curly dark hair, teal blazer, original studio and logo. Preserve Pingo golden retriever and teal bow tie. Natural accurate Brazilian Portuguese lip sync to the supplied Marin audio. Warm energetic conversational delivery, friendly smile and discreet varied hand gestures. Briefly glance toward Pingo when addressing him, then return to camera. Pingo reacts like a natural dog and never speaks human words. Locked camera, consistent original composition. No new characters or objects. Do not add captions, news graphics or music.'};
   await audit('VIDEO_SUBMITTING',{request,billingAtSubmission:billingSnapshot(user),audioSeconds:event('MASTER_READY').duration});
   const result=await api.call('/v3/videos',request);if(typeof result.video_id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(result.video_id))throw new Error('VIDEO_RESPONSE_INVALID');
   await audit('VIDEO_CREATED',{videoId:result.video_id,status:result.status});return;
  }
  const latest=rows.filter(e=>e.event_type==='TEST05_VIDEO_STATUS').at(-1)?.details;if(latest&&Date.now()-latest.checkedAt<30000)return;
  const videoId=event('VIDEO_CREATED').videoId,video=await api.call('/v3/videos/'+videoId);await audit('VIDEO_STATUS',{videoId,status:video.status,checkedAt:Date.now()});
  if(['failed','cancelled'].includes(video.status)){await audit('FAILED',{videoId,status:video.status,code:video.failure_code??'GENERATION_FAILED'});return;}
  if(video.status!=='completed')return;
  const url=new URL(video.video_url);if(url.protocol!=='https:'||!['heygen.ai','heygen.com','amazonaws.com'].some(h=>url.hostname.endsWith('.'+h)))throw new Error('MEDIA_HOST_INVALID');
  const r=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!r.ok)throw new Error('MEDIA_DOWNLOAD_FAILED');const b=Buffer.from(await r.arrayBuffer());if(b.length>250_000_000)throw new Error('MEDIA_TOO_LARGE');await writeFile(resolve(dir,'aroll.mp4'),b);
  const after=billingSnapshot(await api.call('/v3/users/me'));const before=event('STARTED').billingBefore;
  await audit('COMPLETED',{videoId,duration:video.duration,sha256:createHash('sha256').update(b).digest('hex'),videoUrl:video.video_url,billingAfter:after,sharedAccountBalanceDeltaUsd:before.balance!==null&&after.balance!==null?Number((before.balance-after.balance).toFixed(6)):null,videoPageUrl:video.share_url??null});
 }catch(e){await audit('FAILED',{code:e instanceof HeygenError?e.code:e instanceof Error&&/^[A-Z0-9_]+$/.test(e.message)?e.message:'REQUEST_OR_STORAGE_FAILED',httpStatus:e instanceof HeygenError?e.status:null});}
 finally{await c.query('SELECT pg_advisory_unlock(hashtext($1))',[key]).catch(()=>{});c.release();}
}
