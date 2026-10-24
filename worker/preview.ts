import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pool } from '../lib/db';
export async function capturePreview(){
 const r=await pool.query("SELECT id,render_path,render_sha256 FROM episodes e WHERE render_path IS NOT NULL AND status IN ('VERIFYING','READY') AND NOT EXISTS(SELECT 1 FROM audit_events a WHERE a.episode_id=e.id AND a.event_type='RENDER_QA') ORDER BY created_at DESC LIMIT 1");if(!r.rowCount)return;
 const e=r.rows[0];if(!/^ainda-bem-\d{4}-\d{2}-\d{2}(?:-v[1-9]\d*)?$/.test(e.id))return;const expected=resolve(process.env.WORK_DIR||'work',e.id,'video.mp4');if(resolve(e.render_path)!==expected)return;
 const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration,size:stream=codec_name,width,height','-of','json',expected],{encoding:'utf8'});if(probe.status!==0)return;
 const preview=resolve(process.env.WORK_DIR||'work',e.id,'preview.jpg');const shot=spawnSync('ffmpeg',['-y','-ss','6','-i',expected,'-frames:v','1','-vf','scale=960:-2','-q:v','4',preview],{stdio:'ignore'});if(shot.status!==0)return;
 await pool.query("INSERT INTO audit_events(episode_id,event_type,details) VALUES($1,'RENDER_QA',$2)",[e.id,JSON.stringify({...JSON.parse(probe.stdout),sha256:e.render_sha256,previewBase64:(await readFile(preview)).toString('base64')})]);
}
