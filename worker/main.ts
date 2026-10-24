import { mkdir,writeFile,readFile,unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { decrypt } from '../lib/crypto';
import { authorizedClient, expectedChannel } from '../lib/auth';
async function preflight(){
 const ff=spawnSync('ffmpeg',['-version'],{stdio:'ignore'});if(ff.status!==0)throw new Error('FFmpeg unavailable');
 const dir=resolve(process.env.WORK_DIR||'work');await mkdir(dir,{recursive:true});await mkdir(resolve(process.env.MEDIA_ROOT||'work/media'),{recursive:true});
 const probe=resolve(dir,'.probe-'+randomUUID());try{await writeFile(probe,'worker-ready',{flag:'wx'});if(await readFile(probe,'utf8')!=='worker-ready')throw new Error('Storage verification failed');}finally{await unlink(probe).catch(()=>{});}
 const r=await pool.query("SELECT refresh_token_ciphertext FROM oauth_tokens WHERE provider='youtube'");let tokenDecryptable=false;if(r.rowCount){decrypt(r.rows[0].refresh_token_ciphertext);tokenDecryptable=true;}
 const integrations:{[key:string]:boolean|number|string}={event:'integration_readiness'};
 if(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET&&tokenDecryptable){
  try{const auth=await authorizedClient();const t=(await auth.getAccessToken()).token;if(!t)throw new Error('Missing access token');const response=await fetch('https://www.googleapis.com/youtube/v3/channels?part=id&mine=true',{headers:{Authorization:'Bearer '+t},signal:AbortSignal.timeout(20000)});integrations.googleHttpStatus=response.status;integrations.googleRefresh=true;if(response.ok){const data=await response.json();integrations.expectedChannelVerified=data.items?.[0]?.id===expectedChannel;}}
  catch(e){integrations.googleRefresh=false;const err=e as {response?:{status?:number,data?:{error?:unknown}},code?:unknown};if(err.response?.status)integrations.googleTokenHttpStatus=err.response.status;const code=err.response?.data?.error;if(typeof code==='string'&&/^[a-z_]+$/.test(code))integrations.googleTokenError=code;}
  integrations.googleClientIdFormatValid=process.env.GOOGLE_CLIENT_ID.trim().endsWith('.apps.googleusercontent.com');
  integrations.googleCredentialsHaveWhitespace=process.env.GOOGLE_CLIENT_ID!==process.env.GOOGLE_CLIENT_ID.trim()||process.env.GOOGLE_CLIENT_SECRET!==process.env.GOOGLE_CLIENT_SECRET.trim();
 }
 if(process.env.OPENAI_API_KEY&&process.env.OPENAI_TTS_MODEL){
  try{const response=await fetch('https://api.openai.com/v1/models/'+encodeURIComponent(process.env.OPENAI_TTS_MODEL),{headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY},signal:AbortSignal.timeout(20000)});integrations.openaiModelHttpStatus=response.status;integrations.openaiModelAccessible=response.ok;}
  catch{integrations.openaiModelAccessible=false;}
 }
 console.log(JSON.stringify(integrations));
 console.log(JSON.stringify({event:'worker_preflight_passed',ffmpeg:true,storageWritable:true,database:true,tokenDecryptable,googleConfigured:!!(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET),ttsConfigured:!!(process.env.OPENAI_API_KEY&&process.env.OPENAI_TTS_MODEL)}));
}
import { capturePreview } from './preview';
import { prepareNextEdition,runEditorialProbe } from './research';
import { verifyPrivateUploads } from './verify';
import { pool } from '../lib/db';import { render } from './render';import { upload } from './upload';
async function tick(){await verifyPrivateUploads();await capturePreview();await prepareNextEdition();await pool.query("INSERT INTO worker_heartbeats(id) VALUES('renderer') ON CONFLICT(id) DO UPDATE SET updated_at=now()");const c=await pool.connect();let e:any;try{await c.query('BEGIN');const r=await c.query(`SELECT * FROM episodes WHERE (status='QUEUED' AND script_json IS NOT NULL AND quality_approved=true) OR (status IN ('RENDERING','UPLOADING') AND lease_until<now() AND attempts<5) ORDER BY target_publish_at FOR UPDATE SKIP LOCKED LIMIT 1`);e=r.rows[0];if(e){await c.query("UPDATE episodes SET status=CASE WHEN status='UPLOADING' THEN status ELSE 'RENDERING' END,lease_until=now()+interval '5 minutes',attempts=attempts+1,updated_at=now() WHERE id=$1",[e.id]);}await c.query('COMMIT');}catch(x){await c.query('ROLLBACK');throw x;}finally{c.release();}if(!e)return;
const timer=setInterval(()=>{void pool.query("INSERT INTO worker_heartbeats(id) VALUES('renderer') ON CONFLICT(id) DO UPDATE SET updated_at=now()").catch(()=>{});void pool.query("UPDATE episodes SET lease_until=now()+interval '5 minutes',updated_at=now() WHERE id=$1",[e.id]).catch(()=>console.error(JSON.stringify({event:'lease_failed',episodeId:e.id})));},60000);
try{if(e.status!=='UPLOADING'){const r=await render(e.id,e.script_json);e.render_path=r.path;await pool.query("UPDATE episodes SET render_path=$2,render_sha256=$3,status='UPLOADING',updated_at=now() WHERE id=$1",[e.id,r.path,r.sha256]);}const id=await upload(e);await pool.query("UPDATE episodes SET youtube_video_id=$2,status='VERIFYING',lease_until=NULL,updated_at=now() WHERE id=$1",[e.id,id]);await pool.query("INSERT INTO audit_events(episode_id,event_type) VALUES($1,'PRIVATE_UPLOAD_COMPLETE')",[e.id]);console.log(JSON.stringify({event:'private_upload_complete',episodeId:e.id,videoId:id}));}catch(x){const code=x instanceof Error&&/^(TTS HTTP \d+|FFmpeg failed|Approved media unavailable|Video .*failed|Media hash mismatch|Upload [a-z]+ \d+.*)$/.test(x.message)?x.message:(x instanceof Error?x.name:'Error');await pool.query("UPDATE episodes SET last_error=$2,status=CASE WHEN attempts>=5 THEN 'FAILED' ELSE status END,updated_at=now() WHERE id=$1",[e.id,code]);console.error(JSON.stringify({event:'worker_failed',episodeId:e.id,error:code}));}finally{clearInterval(timer);}}
await preflight();
const heartbeat=setInterval(()=>{void pool.query("INSERT INTO worker_heartbeats(id) VALUES('renderer') ON CONFLICT(id) DO UPDATE SET updated_at=now()").catch(()=>{});},60000);
await runEditorialProbe();
let stopping=false;process.on('SIGTERM',()=>{stopping=true;});while(!stopping){try{await tick();}catch(e){console.error(JSON.stringify({event:'worker_tick_failed',code:typeof e==='object'&&e!==null&&'code' in e?String(e.code):'Error'}));}await new Promise(r=>setTimeout(r,15000));}clearInterval(heartbeat);await pool.end();
