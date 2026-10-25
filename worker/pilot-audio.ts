import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';
import { pool } from '../lib/db';
import { synthesize,speechRequest } from './voice';
const schema=z.array(z.object({name:z.string().regex(/^[a-z][a-z0-9-]{0,30}$/),narration:z.string().min(10).max(1800)})).min(1).max(5);
export async function runEditorialAudioPilot(){
 const key=process.env.EDITORIAL_AUDIO_PILOT_KEY;if(!key)return;
 if((await pool.query("SELECT 1 FROM audit_events WHERE event_type='EDITORIAL_AUDIO_PILOT_STARTED' AND details->>'key'=$1",[key])).rowCount)return;
 await pool.query("INSERT INTO audit_events(event_type,details) VALUES('EDITORIAL_AUDIO_PILOT_STARTED',$1)",[JSON.stringify({key})]);
 try{
 const scenes=schema.parse(JSON.parse(process.env.EDITORIAL_AUDIO_PILOT_SCENES||'[]'));
 if(new Set(scenes.map(s=>s.name)).size!==scenes.length)throw new Error('Duplicate pilot scene');
 const dir=resolve(process.env.WORK_DIR||'work','editorial-audio-pilot');await mkdir(dir,{recursive:true});const result=[];
 for(const scene of scenes){const audio=await synthesize(scene.narration);const path=resolve(dir,scene.name+'.mp3');await writeFile(path,audio);const p=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','json',path],{encoding:'utf8'});if(p.status!==0)throw new Error('Pilot audio validation failed');const duration=Number(JSON.parse(p.stdout).format.duration);if(!Number.isFinite(duration)||duration<1||duration>120)throw new Error('Pilot audio duration invalid');result.push({...scene,duration,audioBase64:audio.toString('base64')});}
 const config=speechRequest('');await pool.query("INSERT INTO audit_events(event_type,details) VALUES('EDITORIAL_AUDIO_PILOT_READY',$1)",[JSON.stringify({key,voice:config.voice,model:config.model,scenes:result})]);console.log(JSON.stringify({event:'editorial_audio_pilot_ready',key,voice:config.voice,scenes:result.map(({audioBase64,narration,...s})=>s)}));
 }catch(e){const error=e instanceof Error&&/^[a-zA-Z0-9 .-]+$/.test(e.message)?e.message:'Pilot audio failed';await pool.query("INSERT INTO audit_events(event_type,details) VALUES('EDITORIAL_AUDIO_PILOT_FAILED',$1)",[JSON.stringify({key,error})]);console.error(JSON.stringify({event:'editorial_audio_pilot_failed',key,error}));}
}
