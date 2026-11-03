import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pool } from '../lib/db';
import { HeygenClient,HeygenError,billingSnapshot,assertPilotBudget } from './heygen';
const approvedAvatar='089168db17264c6b91c84d08ade8e559';
const approvedAudio='c6c12bf5b63d40eca6ac8d6ec8c123a1';
async function audit(event:string,details:unknown){await pool.query('INSERT INTO audit_events(event_type,details) VALUES($1,$2)',[event,JSON.stringify(details)]);}
function safeError(e:unknown){return e instanceof HeygenError?{httpStatus:e.status,code:e.code}:{code:e instanceof Error&&['HeyGen API USD balance unavailable or insufficient','HeyGen account mismatch','Approved avatar unavailable','Avatar IV unavailable','Invalid HeyGen key configuration'].includes(e.message)?e.message:'REQUEST_OR_STORAGE_ERROR'};}
export async function verifyHeygenApi(){
 if(!process.env.HEYGEN_API_KEY)return;
 try{const user=await new HeygenClient(process.env.HEYGEN_API_KEY).call('/v3/users/me');const detail={configured:true,authenticated:true,accountMatches:user.username==='83e87bbf2f87443b8db3c699b3aedeba',billing:billingSnapshot(user)};await audit('HEYGEN_API_READY',detail);console.log(JSON.stringify({event:'heygen_api_ready',...detail}));}
 catch(e){const detail={configured:true,authenticated:false,...safeError(e)};await audit('HEYGEN_API_FAILED',detail);console.error(JSON.stringify({event:'heygen_api_failed',...detail}));}
}
// Explicit opt-in for the already authorized test only. No retries of uncertain POSTs.
export async function tickHeygenPilot(){
 const key=process.env.HEYGEN_PILOT_KEY;if(!key||!process.env.HEYGEN_API_KEY)return;
 if(key!=='ainda-bem-04-outro-api-v1')return;
 const lock=await pool.connect();
 try{
  const held=await lock.query('SELECT pg_try_advisory_lock(hashtext($1)) AS held',[key]);if(!held.rows[0].held)return;
  const events=await lock.query("SELECT event_type,details FROM audit_events WHERE details->>'key'=$1 AND event_type LIKE 'HEYGEN_PILOT_%' ORDER BY created_at",[key]);
  if(events.rows.some(e=>['HEYGEN_PILOT_COMPLETED','HEYGEN_PILOT_FAILED'].includes(e.event_type)))return;
  const created=events.rows.find(e=>e.event_type==='HEYGEN_PILOT_CREATED');
  const api=new HeygenClient(process.env.HEYGEN_API_KEY);
  if(!created){
   if(events.rows.some(e=>e.event_type==='HEYGEN_PILOT_SUBMITTING'))return; // uncertain outcome: reconcile, never resubmit
   const user=await api.call('/v3/users/me');if(user.username!=='83e87bbf2f87443b8db3c699b3aedeba')throw new Error('HeyGen account mismatch');
   const before=assertPilotBudget(user,2);
   const look=await api.call('/v3/avatars/looks/'+approvedAvatar);const data=look.avatar_item??look;
   if(data.status&&data.status!=='completed'&&data.status!=='ready')throw new Error('Approved avatar unavailable');
   if(data.supported_api_engines&&!data.supported_api_engines.includes('avatar_iv'))throw new Error('Avatar IV unavailable');
   await api.call('/v3/assets/'+approvedAudio);
   const request={type:'avatar',avatar_id:approvedAvatar,audio_asset_id:approvedAudio,engine:{type:'avatar_iv'},expressiveness:'medium',aspect_ratio:'16:9',resolution:'720p',title:'Ainda Bem! • teste 04 privado • encerramento API • sintético',motion_prompt:'Preserve the approved fictional Clara exactly: same face, curly dark hair, teal blazer, studio and logo. Preserve Pingo golden retriever and teal bow tie. Accurate Brazilian Portuguese lip sync to the supplied Marin audio. Warm lively smile and discreet hand gestures. Briefly glance toward Pingo when addressing him, then return to camera. Pingo remains a natural dog and never speaks human words. Locked camera. No new characters or objects.'};
   await audit('HEYGEN_PILOT_SUBMITTING',{key,billingBefore:before,request,requestedAudioSeconds:25.968,pricingEstimateUsd:1.00,pricingEstimateOnly:true});
   const result=await api.call('/v3/videos',request);
   if(typeof result.video_id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(result.video_id))throw new Error('Unexpected creation response');
   await audit('HEYGEN_PILOT_CREATED',{key,videoId:result.video_id,status:result.status});console.log(JSON.stringify({event:'heygen_pilot_created',key,videoId:result.video_id}));return;
  }
  const latest=events.rows.filter(e=>e.event_type==='HEYGEN_PILOT_STATUS').at(-1);if(latest&&Date.now()-latest.details.checkedAt<30000)return;
  const videoId=created.details.videoId;const video=await api.call('/v3/videos/'+videoId);
  await audit('HEYGEN_PILOT_STATUS',{key,videoId,status:video.status,checkedAt:Date.now()});
  if(['failed','cancelled'].includes(video.status)){await audit('HEYGEN_PILOT_FAILED',{key,videoId,status:video.status,failureCode:typeof video.failure_code==='string'?video.failure_code:'GENERATION_FAILED'});return;}
  if(video.status!=='completed')return;
  const url=new URL(video.video_url);if(url.protocol!=='https:'||!['heygen.ai','heygen.com','amazonaws.com'].some(h=>url.hostname.endsWith('.'+h)))throw new Error('Untrusted media URL');
  const response=await fetch(url,{signal:AbortSignal.timeout(90000)});if(!response.ok)throw new Error('Media retrieval failed');const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>100_000_000)throw new Error('Media too large');
  const dir=resolve(process.env.WORK_DIR||'work','heygen-pilot',key);await mkdir(dir,{recursive:true});await writeFile(resolve(dir,'encerramento.mp4'),bytes);
  const after=billingSnapshot(await api.call('/v3/users/me'));const before=events.rows.find(e=>e.event_type==='HEYGEN_PILOT_SUBMITTING')?.details.billingBefore;
  const balanceChange=before?.currency===after.currency&&typeof before?.balance==='number'&&after.balance!==null?Number((before.balance-after.balance).toFixed(6)):null;
  await audit('HEYGEN_PILOT_COMPLETED',{key,videoId,duration:video.duration,path:resolve(dir,'encerramento.mp4'),sha256:createHash('sha256').update(bytes).digest('hex'),billingAfter:after,balanceChangeUsd:balanceChange,balanceChangeIsSharedAccountDelta:true,videoUrl:video.video_url});console.log(JSON.stringify({event:'heygen_pilot_completed',key,videoId,duration:video.duration,balanceChangeUsd:balanceChange}));
 }catch(e){await audit('HEYGEN_PILOT_FAILED',{key,...safeError(e)});console.error(JSON.stringify({event:'heygen_pilot_failed',key,...safeError(e)}));}
 finally{await lock.query('SELECT pg_advisory_unlock(hashtext($1))',[key]).catch(()=>{});lock.release();}
}
