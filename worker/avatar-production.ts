import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { resolve,sep } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn,spawnSync } from 'node:child_process';
import { pool } from '../lib/db';
import { authorizedClient,expectedChannel } from '../lib/auth';
import { studioPlanSchema } from '../lib/studio-plan';
import { assertProductionBudget,assertNationalCoverage } from './production-policy';
import { HeygenClient,billingSnapshot } from './heygen';
import { synthesize } from './voice';
import { runStudio } from './studio';
export class ProductionBlocked extends Error{constructor(public code:string){super(code);this.name='ProductionBlocked';}}
export async function paidOnce<T>(store:{read:()=>Promise<{started:boolean;complete:boolean;data:T}>;start:()=>Promise<void>;complete:(data:T)=>Promise<void>},operation:()=>Promise<T>){
 const state=await store.read();if(state.complete)return state.data;if(state.started)throw new ProductionBlocked('PAID_STAGE_RECONCILIATION_REQUIRED');
 await store.start();const data=await operation();await store.complete(data);return data;
}
async function audit(id:string,event:string,details:unknown){await pool.query('INSERT INTO audit_events(episode_id,event_type,details) VALUES($1,$2,$3)',[id,event,JSON.stringify(details)]);}
async function stage<T>(id:string,name:string,operation:()=>Promise<T>):Promise<T>{
 return paidOnce<T>({read:async()=>{const r=await pool.query("SELECT event_type,details FROM audit_events WHERE episode_id=$1 AND details->>'stage'=$2 AND event_type IN ('PRODUCTION_STAGE_STARTED','PRODUCTION_STAGE_READY') ORDER BY created_at",[id,name]);const ready=r.rows.find(x=>x.event_type==='PRODUCTION_STAGE_READY');return {started:(r.rowCount??0)>0,complete:!!ready,data:ready?.details.data};},start:()=>audit(id,'PRODUCTION_STAGE_STARTED',{stage:name}),complete:data=>audit(id,'PRODUCTION_STAGE_READY',{stage:name,data})},operation);
}
async function ff(args:string[]){await new Promise<void>((ok,no)=>{const p=spawn('ffmpeg',['-nostdin','-y','-v','error',...args],{stdio:'ignore'});p.on('error',no);p.on('close',c=>c===0?ok():no(new Error('FFmpeg failed')));});}
function seconds(path:string){const r=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','json',path],{encoding:'utf8'});if(r.status!==0)throw new ProductionBlocked('MEDIA_PROBE_FAILED');return Number(JSON.parse(r.stdout).format.duration);}
export async function renderAvatarEdition(id:string,script:any){
 const plan=studioPlanSchema.parse(script.presentation);assertNationalCoverage(plan.stories);
 if(!script.scenes?.length)throw new ProductionBlocked('SCENES_REQUIRED');
 const canonical=(value:string)=>{const u=new URL(value);u.hash='';for(const k of [...u.searchParams.keys()])if(k.startsWith('utm_')||k==='fbclid')u.searchParams.delete(k);return u.toString().replace(/\/$/,'');};
 const dir=resolve(process.env.WORK_DIR||'work',id);await mkdir(dir,{recursive:true});
 const inserts=[];for(const item of plan.inserts){if(item.kind==='image'){if(!item.path||!item.sha256)throw new ProductionBlocked('IMAGE_EVIDENCE_REQUIRED');const root=resolve(process.env.MEDIA_ROOT||'work/media'),path=resolve(root,item.path);if(!path.startsWith(root+sep))throw new ProductionBlocked('IMAGE_OUTSIDE_ROOT');let b:Buffer;try{b=await readFile(path);}catch{const row=await pool.query('SELECT data_base64 FROM media_assets WHERE sha256=$1',[item.sha256]);if(!row.rowCount)throw new ProductionBlocked('IMAGE_UNAVAILABLE');b=Buffer.from(row.rows[0].data_base64,'base64');}if(createHash('sha256').update(b).digest('hex')!==item.sha256)throw new ProductionBlocked('IMAGE_HASH_MISMATCH');const copy=resolve(dir,'image-'+item.sha256+'.png');await writeFile(copy,b);inserts.push({...item,path:copy});}else inserts.push(item);}
 const mainUrls=new Set(plan.stories.map(s=>canonical(s.source.url)));
 if(plan.ticker.some(t=>mainUrls.has(canonical(t.source.url))))throw new ProductionBlocked('TICKER_REPEATS_NARRATED_STORY');
 if([...plan.stories,...plan.ticker].some(s=>!script.sources.some((x:any)=>canonical(x.url)===canonical(s.source.url))))throw new ProductionBlocked('UNVERIFIED_STORY_SOURCE');
 const api=new HeygenClient(process.env.HEYGEN_API_KEY||'');const user=await api.call('/v3/users/me');
 if(user.username!=='83e87bbf2f87443b8db3c699b3aedeba')throw new ProductionBlocked('HEYGEN_ACCOUNT_MISMATCH');const wallet=billingSnapshot(user);
 const alreadyCreated=(await pool.query("SELECT 1 FROM audit_events WHERE episode_id=$1 AND event_type='PRODUCTION_STAGE_READY' AND details->>'stage'='heygen-video'",[id])).rowCount;
 if(!alreadyCreated){
  const look=await api.call('/v3/avatars/looks/'+plan.avatarId),info=look.avatar_item??look;if(info.supported_api_engines&&!info.supported_api_engines.includes(plan.engine))throw new ProductionBlocked('APPROVED_AVATAR_UNAVAILABLE');
  if(wallet.currency!=='usd'||wallet.billingType!=='wallet')throw new ProductionBlocked('HEYGEN_WALLET_UNAVAILABLE');
  try{assertProductionBudget(plan.maxAudioSeconds,wallet.balance,plan.maxHeygenUsd);}catch{throw new ProductionBlocked('HEYGEN_BUDGET_INSUFFICIENT');}
  try{const auth=await authorizedClient();const token=(await auth.getAccessToken()).token;const r=await fetch('https://www.googleapis.com/youtube/v3/channels?part=id&mine=true',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});if(!r.ok||(await r.json()).items?.[0]?.id!==expectedChannel)throw new Error();}catch{throw new ProductionBlocked('YOUTUBE_REAUTHORIZATION_REQUIRED');}
 }
 
 const digest=createHash('sha256').update(JSON.stringify(script)).digest('hex');
 const first=await stage(id,'confirmed-script',async()=>({sha256:digest,billingBefore:wallet}));if(first.sha256!==digest)throw new ProductionBlocked('SCRIPT_CHANGED_AFTER_GENERATION');
 const durations:number[]=[],alignment:any[]=[];
 for(let i=0;i<script.scenes.length;i++){
  const audio=await stage(id,'voice-'+i,async()=>{const mp3=resolve(dir,`voice-${i}.mp3`),wav=resolve(dir,`voice-${i}.wav`);await writeFile(mp3,await synthesize(script.scenes[i].narration,'marin'));await ff(['-i',mp3,'-ar','48000','-ac','1','-c:a','pcm_s16le',wav]);const duration=seconds(wav);if(!Number.isFinite(duration)||duration<=0||duration>150)throw new ProductionBlocked('SCENE_DURATION_INVALID');return {wav,duration};});durations.push(audio.duration);
  const asr=await stage(id,'alignment-'+i,async()=>{const body=new FormData();body.append('file',new Blob([await readFile(audio.wav)],{type:'audio/wav'}),'speech.wav');body.append('model','whisper-1');body.append('language','pt');body.append('response_format','verbose_json');body.append('timestamp_granularities[]','word');body.append('timestamp_granularities[]','segment');const r=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY},body,signal:AbortSignal.timeout(120000)});if(!r.ok)throw new ProductionBlocked('TRANSCRIPTION_FAILED');const x=await r.json();if(!x.words?.length)throw new ProductionBlocked('ALIGNMENT_MISSING');return {transcript:x.text,words:x.words,segments:x.segments};});alignment.push(asr);
 }
 const total=durations.reduce((a,b)=>a+b,0);if(total>plan.maxAudioSeconds)throw new ProductionBlocked('SCRIPT_EXCEEDS_DURATION_BUDGET');
 await writeFile(resolve(dir,'concat.txt'),durations.map((_,i)=>`file 'voice-${i}.wav'`).join('\n'));await ff(['-f','concat','-safe','0','-i',resolve(dir,'concat.txt'),'-c:a','copy',resolve(dir,'master.wav')]);await ff(['-i',resolve(dir,'master.wav'),'-c:a','libmp3lame','-b:a','192k',resolve(dir,'master.mp3')]);
 const asset=await stage(id,'heygen-audio',async()=>api.uploadAudio(await readFile(resolve(dir,'master.mp3')),'audio/mpeg'));
 const created=await stage(id,'heygen-video',async()=>{const u=await api.call('/v3/users/me');assertProductionBudget(total,billingSnapshot(u).balance,plan.maxHeygenUsd);return api.call('/v3/videos',{type:'avatar',avatar_id:plan.avatarId,audio_asset_id:asset.asset_id,engine:{type:'avatar_iv'},expressiveness:'medium',aspect_ratio:'16:9',resolution:'720p',title:script.title,motion_prompt:'Preserve approved Clara face, curly hair, teal blazer, original studio and logo. Preserve Pingo golden retriever and teal bow tie. Warm energetic Brazilian Portuguese lip sync to supplied Marin audio, discreet gestures. Briefly glance at Pingo when addressing him. Pingo remains a natural dog and never speaks. Locked camera and original framing. No captions, graphics, music, new characters or objects.'});});
 if(typeof created.video_id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(created.video_id))throw new ProductionBlocked('VIDEO_CREATE_OUTCOME_UNCERTAIN');
 let result:any;for(;;){result=await api.call('/v3/videos/'+created.video_id);if(result.status==='completed')break;if(['failed','cancelled'].includes(result.status))throw new ProductionBlocked('AVATAR_GENERATION_FAILED');await new Promise(r=>setTimeout(r,30000));}
 const source=await stage(id,'download-avatar',async()=>{const url=new URL(result.video_url);if(url.protocol!=='https:'||!['heygen.ai','heygen.com','amazonaws.com'].some(h=>url.hostname.endsWith('.'+h)))throw new ProductionBlocked('AVATAR_DOWNLOAD_HOST_INVALID');const r=await fetch(url,{signal:AbortSignal.timeout(180000)});if(!r.ok)throw new ProductionBlocked('AVATAR_DOWNLOAD_FAILED');const b=Buffer.from(await r.arrayBuffer());const path=resolve(dir,'aroll.mp4');await writeFile(path,b);return {path,sha256:createHash('sha256').update(b).digest('hex')};});
 const rendered=await runStudio(resolve(dir,'assembled'),{video:source.path,audio:resolve(dir,'master.wav'),durations,alignment,captionCorrections:plan.captionCorrections,ticker:plan.ticker.map(t=>t.headline),inserts});
 await audit(id,'STUDIO_RENDER_COMPLETE',{sha256:rendered.sha256,videoId:created.video_id,duration:rendered.verification.durationSeconds,billingAfter:billingSnapshot(await api.call('/v3/users/me')),privateOnly:true});return rendered;
}
