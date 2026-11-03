import { pool } from '../lib/db';

// Align only the five already approved test audios; never regenerate speech.
export async function alignPilotCaptions(){
 if(process.env.HEYGEN_PILOT_KEY!=='ainda-bem-04-outro-api-v1'||!process.env.OPENAI_API_KEY)return;
 const key='clara-pingo-edicao-completa-04';
 const c=await pool.connect();
 try{
  if(!(await c.query('SELECT pg_try_advisory_lock(hashtext($1)) AS held',['captions:'+key])).rows[0].held)return;
  const audio=await c.query("SELECT details FROM audit_events WHERE event_type='EDITORIAL_AUDIO_PILOT_READY' AND details->>'key'=$1 ORDER BY created_at DESC LIMIT 1",[key]);
  if(!audio.rowCount)return;
  for(const scene of audio.rows[0].details.scenes){
   const exists=await c.query("SELECT 1 FROM audit_events WHERE event_type='PILOT_ALIGNMENT_STARTED' AND details->>'key'=$1 AND details->>'scene'=$2",[key,scene.name]);
   if(exists.rowCount)continue;
   await c.query("INSERT INTO audit_events(event_type,details) VALUES('PILOT_ALIGNMENT_STARTED',$1)",[JSON.stringify({key,scene:scene.name,model:'whisper-1'})]);
   try{
    const bytes=Buffer.from(scene.audioBase64,'base64');
    const form=new FormData();form.append('file',new Blob([bytes],{type:'audio/mpeg'}),scene.name+'.mp3');form.append('model','whisper-1');form.append('language','pt');form.append('response_format','verbose_json');form.append('timestamp_granularities[]','word');form.append('timestamp_granularities[]','segment');
    const r=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY},body:form,signal:AbortSignal.timeout(120000)});
    if(!r.ok)throw new Error('HTTP_'+r.status);
    const data=await r.json();if(!Array.isArray(data.words)||!data.words.length)throw new Error('MISSING_WORD_TIMINGS');
    await c.query("INSERT INTO audit_events(event_type,details) VALUES('PILOT_ALIGNMENT_READY',$1)",[JSON.stringify({key,scene:scene.name,model:'whisper-1',sourceDuration:scene.duration,transcript:data.text,words:data.words,segments:data.segments,usage:data.usage??null})]);
   }catch(e){await c.query("INSERT INTO audit_events(event_type,details) VALUES('PILOT_ALIGNMENT_FAILED',$1)",[JSON.stringify({key,scene:scene.name,code:e instanceof Error&&/^(HTTP_\d+|MISSING_WORD_TIMINGS)$/.test(e.message)?e.message:'REQUEST_FAILED'})]);}
  }
 }finally{await c.query('SELECT pg_advisory_unlock(hashtext($1))',['captions:'+key]).catch(()=>{});c.release();}
}
